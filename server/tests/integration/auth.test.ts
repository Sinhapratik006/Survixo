import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGoogleGateway, type GoogleIdentity } from '../../src/services/google.js';
import { cookieValue, getApp, ORIGIN, prisma, resetDatabase, signUp } from './helpers.js';

beforeAll(resetDatabase);
afterAll(() => setGoogleGateway(null));

describe('email/password authentication', () => {
  it('signs up, creates a personal workspace with labelled demo credit, and returns the session', async () => {
    const client = await signUp('alice@example.com');
    const me = await client.get('/api/auth/me');
    expect(me.body.user.email).toBe('alice@example.com');
    expect(me.body.user.emailVerified).toBe(false);
    expect(me.body.memberships).toHaveLength(1);
    expect(me.body.memberships[0]).toMatchObject({ personal: true, role: 'OWNER' });
    expect(me.body.memberships[0].permissions).toContain('keys:manage');
    const tx = await prisma.billingTransaction.findMany({ where: { orgId: client.orgId } });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ type: 'DEMO_CREDIT', amountMicros: 5_000_000n });
    expect(tx[0]!.description).toMatch(/not real money/);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    const dup = await request(getApp()).post('/api/auth/signup').set('origin', ORIGIN).send({ email: 'ALICE@example.com', password: 'another-password' });
    expect(dup.status).toBe(409);
    const weak = await request(getApp()).post('/api/auth/signup').set('origin', ORIGIN).send({ email: 'bob@example.com', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('validation_error');
  });

  it('logs in with correct credentials only, with a generic error', async () => {
    const bad = await request(getApp()).post('/api/auth/login').set('origin', ORIGIN).send({ email: 'alice@example.com', password: 'wrong-password!' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('invalid_credentials');
    const unknown = await request(getApp()).post('/api/auth/login').set('origin', ORIGIN).send({ email: 'nobody@example.com', password: 'whatever-123' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(bad.body.error.message);
    const ok = await request(getApp()).post('/api/auth/login').set('origin', ORIGIN).send({ email: 'alice@example.com', password: 'correct-horse-battery' });
    expect(ok.status).toBe(200);
    expect(cookieValue(ok, 'nx_session')).toBeTruthy();
    const raw = (ok.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('nx_session='))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it('does not store session tokens in plaintext', async () => {
    const ok = await request(getApp()).post('/api/auth/login').set('origin', ORIGIN).send({ email: 'alice@example.com', password: 'correct-horse-battery' });
    const token = cookieValue(ok, 'nx_session')!;
    expect(await prisma.session.count({ where: { tokenHash: token } })).toBe(0);
  });
});

describe('authorization and CSRF', () => {
  it('blocks unauthenticated access to protected endpoints', async () => {
    for (const path of ['/api/usage/summary', '/api/api-keys', '/api/billing/overview', '/api/sellers/offers', '/api/orgs/current', '/api/dashboard/summary']) {
      const res = await request(getApp()).get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it('requires a valid CSRF token for state-changing requests', async () => {
    const client = await signUp();
    const missing = await client.agent.post('/api/api-keys').set('origin', ORIGIN).send({ name: 'x' });
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('csrf_invalid');
    const wrong = await client.agent.post('/api/api-keys').set('origin', ORIGIN).set('x-csrf-token', 'forged').send({ name: 'x' });
    expect(wrong.status).toBe(403);
    const ok = await client.post('/api/api-keys', { name: 'x' });
    expect(ok.status).toBe(201);
  });

  it('rejects cross-origin state-changing requests', async () => {
    const client = await signUp();
    const res = await client.agent.post('/api/api-keys').set('origin', 'https://evil.example').set('x-csrf-token', client.csrf).send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf_origin');
  });

  it('logout invalidates the session server-side', async () => {
    const client = await signUp();
    expect((await client.post('/api/auth/logout')).status).toBe(200);
    const me = await client.get('/api/auth/me');
    expect(me.body.user).toBeNull();
  });
});

describe('Google sign-in (OAuth 2.0 + OIDC, PKCE)', () => {
  let identity: GoogleIdentity;
  let lastVerifier = '';
  beforeEach(() => {
    identity = { sub: `google-${Math.random()}`, email: 'gina@example.com', emailVerified: true, name: 'Gina', picture: 'https://lh3.googleusercontent.com/a/x' };
    setGoogleGateway({
      async exchangeAndVerify(code, verifier) {
        if (code !== 'good-code') throw Object.assign(new Error('bad'), {});
        lastVerifier = verifier;
        return identity;
      },
    });
  });

  async function startFlow(agent: ReturnType<typeof request.agent>, redirect = '/dashboard/usage') {
    const res = await agent.get(`/api/auth/google/start?redirect=${encodeURIComponent(redirect)}`);
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location as string);
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    return url.searchParams.get('state')!;
  }

  it('creates a verified account, signs in and redirects to a safe path', async () => {
    const agent = request.agent(getApp());
    const state = await startFlow(agent);
    const cb = await agent.get(`/api/auth/google/callback?code=good-code&state=${state}`);
    expect(cb.status).toBe(303);
    expect(cb.headers.location).toBe(`${ORIGIN}/dashboard/usage`);
    expect(lastVerifier.length).toBeGreaterThan(40);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ email: 'gina@example.com', emailVerified: true, hasPassword: false });
    expect(me.body.user.linkedAccounts[0].provider).toBe('google');
    expect(me.body.memberships[0].role).toBe('OWNER');
  });

  it('signs an existing Google user back in to the same account', async () => {
    identity.sub = 'stable-sub';
    identity.email = 'returning@example.com';
    for (let i = 0; i < 2; i++) {
      const agent = request.agent(getApp());
      const state = await startFlow(agent);
      await agent.get(`/api/auth/google/callback?code=good-code&state=${state}`);
    }
    expect(await prisma.user.count({ where: { email: 'returning@example.com' } })).toBe(1);
  });

  it('rejects a mismatched state (CSRF on the OAuth callback)', async () => {
    const agent = request.agent(getApp());
    await startFlow(agent);
    const cb = await agent.get('/api/auth/google/callback?code=good-code&state=attacker-state');
    expect(cb.headers.location).toBe(`${ORIGIN}/login?error=google_state_mismatch`);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('rejects callbacks without the signed state cookie', async () => {
    const cb = await request(getApp()).get('/api/auth/google/callback?code=good-code&state=anything');
    expect(cb.headers.location).toBe(`${ORIGIN}/login?error=google_state_mismatch`);
  });

  it('rejects unverified Google emails', async () => {
    identity.emailVerified = false;
    identity.email = 'unverified@example.com';
    const agent = request.agent(getApp());
    const state = await startFlow(agent);
    const cb = await agent.get(`/api/auth/google/callback?code=good-code&state=${state}`);
    expect(cb.headers.location).toBe(`${ORIGIN}/login?error=google_email_unverified`);
  });

  it('ignores unsafe redirect targets (open redirect protection)', async () => {
    const agent = request.agent(getApp());
    identity.email = 'redirect@example.com';
    const state = await startFlow(agent, '//evil.example/phish');
    const cb = await agent.get(`/api/auth/google/callback?code=good-code&state=${state}`);
    expect(cb.headers.location).toBe(`${ORIGIN}/dashboard`);
  });

  it('prevents pre-account takeover of an unverified password account with the same email', async () => {
    const attacker = await signUp('victim@example.com', 'attacker-chosen-pw');
    identity.email = 'victim@example.com';
    const agent = request.agent(getApp());
    const state = await startFlow(agent);
    await agent.get(`/api/auth/google/callback?code=good-code&state=${state}`);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'victim@example.com' } });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerified).toBe(true);
    // The attacker's pre-existing session was revoked and the password no longer works.
    expect((await attacker.get('/api/auth/me')).body.user).toBeNull();
    const login = await request(getApp()).post('/api/auth/login').set('origin', ORIGIN).send({ email: 'victim@example.com', password: 'attacker-chosen-pw' });
    expect(login.status).toBe(401);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('victim@example.com');
  });

  it('reports which sign-in providers are enabled', async () => {
    const res = await request(getApp()).get('/api/auth/providers');
    expect(res.body).toEqual({ password: true, google: true });
  });
});
