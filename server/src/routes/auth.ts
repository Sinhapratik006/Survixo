import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { HttpError, conflict, unauthorized } from '../lib/errors.js';
import { parse } from '../middleware/error.js';
import { rateLimit, ipKey } from '../middleware/rateLimit.js';
import { permissionsFor } from '../middleware/org.js';
import { getDummyHash, hashPassword, verifyPassword } from '../security/password.js';
import { createSession, clearSessionCookies, clientIp } from '../services/sessions.js';
import { createUserWithWorkspace, normalizeEmail } from '../services/users.js';
import { OAUTH_COOKIE, beginGoogleFlow, decodeState, getGoogleGateway, resolveGoogleUser } from '../services/google.js';
import { audit } from '../services/audit.js';
import { safeEqual } from '../security/crypto.js';
import { logger } from '../lib/logger.js';

export const authRouter = Router();

const password = z.string().min(10, 'Password must be at least 10 characters').max(128);
const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password,
  name: z.string().trim().min(1).max(100).optional(),
});
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

const authLimiter = rateLimit({ name: 'auth', windowSeconds: 60, max: env.AUTH_RATE_LIMIT_PER_MINUTE, key: ipKey });
const loginEmailLimiter = rateLimit({
  name: 'login-email',
  windowSeconds: 900,
  max: Math.max(8, Math.ceil(env.AUTH_RATE_LIMIT_PER_MINUTE * 0.8)),
  key: (req) => (typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : null),
});

authRouter.get('/providers', (_req, res) => {
  res.json({ password: true, google: env.googleEnabled });
});

authRouter.get('/me', async (req, res) => {
  if (!req.auth) return res.json({ user: null, memberships: [] });
  const [memberships, accounts, user] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: req.auth.user.id },
      include: { org: { select: { id: true, name: true, slug: true, personal: true } } },
      orderBy: [{ org: { personal: 'desc' } }, { createdAt: 'asc' }],
    }),
    prisma.oAuthAccount.findMany({ where: { userId: req.auth.user.id }, select: { provider: true, email: true, createdAt: true } }),
    prisma.user.findUnique({ where: { id: req.auth.user.id }, select: { passwordHash: true, theme: true, createdAt: true } }),
  ]);
  res.json({
    user: {
      ...req.auth.user,
      hasPassword: Boolean(user?.passwordHash),
      theme: user?.theme ?? 'system',
      createdAt: user?.createdAt,
      linkedAccounts: accounts,
    },
    memberships: memberships.map((m) => ({ ...m.org, role: m.role, permissions: permissionsFor(m.role) })),
  });
});

authRouter.post('/signup', authLimiter, async (req, res) => {
  const body = parse(signupSchema, req.body);
  const email = normalizeEmail(body.email);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } }))
    throw conflict('An account with this email already exists. Sign in instead.', 'email_taken');
  const user = await createUserWithWorkspace({ email, name: body.name, passwordHash: await hashPassword(body.password), emailVerified: false });
  await createSession(res, req, user.id);
  await audit({ actorUserId: user.id, action: 'auth.signup.password', ip: clientIp(req) });
  res.status(201).json({ ok: true });
});

authRouter.post('/login', authLimiter, loginEmailLimiter, async (req, res) => {
  const body = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(body.email) } });
  // Always run a hash comparison to keep timing similar for unknown accounts.
  const ok = user?.passwordHash ? await verifyPassword(body.password, user.passwordHash) : (await verifyPassword(body.password, await getDummyHash()), false);
  if (!user || !ok || user.deletedAt) throw unauthorized('Incorrect email or password.', 'invalid_credentials');
  await createSession(res, req, user.id);
  await audit({ actorUserId: user.id, action: 'auth.login.password', ip: clientIp(req) });
  res.json({ ok: true });
});

authRouter.post('/logout', async (req, res) => {
  if (req.auth) await prisma.session.deleteMany({ where: { id: req.auth.sessionId } });
  clearSessionCookies(res);
  res.json({ ok: true });
});

// ───────────── Google OAuth 2.0 / OpenID Connect (authorization code + PKCE) ─────────────

authRouter.get('/google/start', authLimiter, (req, res) => {
  if (!env.googleEnabled) return res.redirect(303, `${env.APP_URL}/login?error=google_not_configured`);
  const mode = req.query.mode === 'link' && req.auth ? 'link' : 'login';
  const flow = beginGoogleFlow(req.query.redirect, mode);
  res.cookie(OAUTH_COOKIE, flow.cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd || env.APP_URL.startsWith('https://'),
    path: '/api/auth/google',
    maxAge: flow.ttlMs,
  });
  res.redirect(302, flow.url);
});

authRouter.get('/google/callback', authLimiter, async (req, res) => {
  const fail = (code: string) => {
    res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/google' });
    res.redirect(303, `${env.APP_URL}/login?error=${encodeURIComponent(code)}`);
  };
  if (!env.googleEnabled) return fail('google_not_configured');
  if (typeof req.query.error === 'string') return fail(req.query.error === 'access_denied' ? 'google_cancelled' : 'google_error');

  const state = decodeState(req.cookies?.[OAUTH_COOKIE]);
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const returnedState = typeof req.query.state === 'string' ? req.query.state : '';
  if (!state || !code || !safeEqual(returnedState, state.state)) return fail('google_state_mismatch');

  try {
    const identity = await getGoogleGateway().exchangeAndVerify(code, state.verifier, state.nonce);
    const userId = await resolveGoogleUser(identity, { mode: state.mode, currentUserId: req.auth?.user.id, ip: clientIp(req) });
    res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/google' });
    if (state.mode === 'login') {
      if (req.auth) await prisma.session.deleteMany({ where: { id: req.auth.sessionId } });
      await createSession(res, req, userId);
      await audit({ actorUserId: userId, action: 'auth.login.google', ip: clientIp(req) });
    }
    res.redirect(303, `${env.APP_URL}${state.redirect}`);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.code);
    logger.error({ err }, 'google sign-in failed');
    return fail('google_error');
  }
});
