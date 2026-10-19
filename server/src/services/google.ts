import { createHash, createHmac, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/errors.js';
import { safeEqual } from '../security/crypto.js';
import { createUserWithWorkspace, normalizeEmail } from './users.js';
import { revokeAllSessions } from './sessions.js';
import { audit } from './audit.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const OAUTH_COOKIE = 'nx_oauth';
const STATE_TTL_MS = 10 * 60_000;

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/** Network-facing part of the Google flow; replaceable in tests. */
export interface GoogleGateway {
  exchangeAndVerify(code: string, codeVerifier: string, expectedNonce: string): Promise<GoogleIdentity>;
}

const defaultGateway: GoogleGateway = {
  async exchangeAndVerify(code, codeVerifier, expectedNonce) {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        code_verifier: codeVerifier,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: env.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new HttpError(401, 'google_token_exchange_failed', 'Google rejected the authorization code.');
    const tokens = (await res.json()) as { id_token?: string };
    if (!tokens.id_token) throw new HttpError(401, 'google_missing_id_token', 'Google did not return an ID token.');

    // Verifies signature (Google JWKs), audience, issuer and expiry.
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID! });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new HttpError(401, 'google_invalid_token', 'Google ID token is missing required claims.');
    if (!payload.nonce || !safeEqual(payload.nonce, expectedNonce))
      throw new HttpError(401, 'google_nonce_mismatch', 'Google sign-in could not be verified (nonce mismatch).');
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name,
      picture: payload.picture,
    };
  },
};

let gateway: GoogleGateway = defaultGateway;
export function setGoogleGateway(g: GoogleGateway | null) {
  gateway = g ?? defaultGateway;
}
export function getGoogleGateway() {
  return gateway;
}

// ── Signed, short-lived state cookie (state + nonce + PKCE verifier) ──

export interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  redirect: string;
  mode: 'login' | 'link';
  exp: number;
}

function sign(data: string) {
  return createHmac('sha256', env.SESSION_SECRET).update(`oauth:${data}`).digest('base64url');
}

export function encodeState(s: OAuthState): string {
  const data = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function decodeState(cookie: string | undefined): OAuthState | null {
  if (!cookie) return null;
  const [data, sig] = cookie.split('.');
  if (!data || !sig || !safeEqual(sign(data), sig)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as OAuthState;
    if (typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** Only same-site relative paths are accepted as post-login destinations (open-redirect protection). */
export function safeRedirectPath(input: unknown, fallback = '/dashboard'): string {
  if (typeof input !== 'string') return fallback;
  if (!/^\/(?![/\\])[\w\-./?=&%#~]*$/.test(input) || input.startsWith('/api') || input.length > 300) return fallback;
  return input;
}

export function beginGoogleFlow(redirect: unknown, mode: 'login' | 'link') {
  const verifier = randomBytes(32).toString('base64url');
  const state: OAuthState = {
    state: randomBytes(16).toString('base64url'),
    nonce: randomBytes(16).toString('base64url'),
    verifier,
    redirect: safeRedirectPath(redirect),
    mode,
    exp: Date.now() + STATE_TTL_MS,
  };
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: state.state,
    nonce: state.nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    access_type: 'online',
  }).toString();
  return { url: url.toString(), cookie: encodeState(state), ttlMs: STATE_TTL_MS };
}

/**
 * Map a verified Google identity to a Nexovra user.
 * - Existing Google link → that user.
 * - `link` mode with an active session → attach Google to the current user.
 * - Matching email → link to that user. If that account's email was never
 *   verified, its password and sessions are revoked first, because a
 *   pre-registered password account could otherwise be hijacked
 *   ("pre-account takeover").
 * - Otherwise → create a new user and personal workspace.
 */
export async function resolveGoogleUser(identity: GoogleIdentity, opts: { mode: 'login' | 'link'; currentUserId?: string | null; ip?: string | null }): Promise<string> {
  if (!identity.emailVerified) throw new HttpError(403, 'google_email_unverified', 'Your Google account email is not verified.');
  const email = normalizeEmail(identity.email);
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: identity.sub } },
    include: { user: { select: { id: true, deletedAt: true } } },
  });

  if (opts.mode === 'link') {
    if (!opts.currentUserId) throw new HttpError(401, 'unauthorized', 'Sign in before linking a Google account.');
    if (linked && linked.userId !== opts.currentUserId)
      throw new HttpError(409, 'google_already_linked', 'This Google account is linked to a different Nexovra user.');
    if (!linked) {
      await prisma.oAuthAccount.create({ data: { userId: opts.currentUserId, provider: 'google', providerAccountId: identity.sub, email } });
      await audit({ actorUserId: opts.currentUserId, action: 'auth.google.linked', ip: opts.ip });
    }
    return opts.currentUserId;
  }

  if (linked) {
    if (linked.user.deletedAt) throw new HttpError(403, 'account_deleted', 'This account has been deleted.');
    return linked.userId;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.deletedAt) throw new HttpError(403, 'account_deleted', 'This account has been deleted.');
    if (!existing.emailVerified) {
      await revokeAllSessions(existing.id);
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: null, emailVerified: true } });
      await audit({ actorUserId: existing.id, action: 'auth.google.claimed_unverified_account', ip: opts.ip });
    }
    await prisma.oAuthAccount.create({ data: { userId: existing.id, provider: 'google', providerAccountId: identity.sub, email } });
    await prisma.user.update({
      where: { id: existing.id },
      data: { ...(existing.name ? {} : { name: identity.name }), ...(existing.avatarUrl ? {} : { avatarUrl: identity.picture }) },
    });
    await audit({ actorUserId: existing.id, action: 'auth.google.linked', ip: opts.ip });
    return existing.id;
  }

  const user = await createUserWithWorkspace({
    email,
    name: identity.name,
    emailVerified: true,
    avatarUrl: identity.picture,
    google: { sub: identity.sub, email },
  });
  await audit({ actorUserId: user.id, action: 'auth.signup.google', ip: opts.ip });
  return user.id;
}
