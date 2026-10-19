import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../../src/security/crypto.js';
import { generateApiKey, hashApiKey, looksLikeApiKey, maskKey } from '../../src/security/apiKeys.js';
import { hashPassword, verifyPassword } from '../../src/security/password.js';
import { isPublicAddress, validateOutboundUrl } from '../../src/security/ssrf.js';
import { redactText, sanitizeUpstreamError } from '../../src/security/redact.js';
import { signWebhook, verifyWebhookSignature } from '../../src/security/webhookSignature.js';
import { beginGoogleFlow, decodeState, encodeState, safeRedirectPath } from '../../src/services/google.js';
import { verifyStripeSignature } from '../../src/billing/stripe.js';
import { hmacHex } from '../../src/security/crypto.js';

describe('envelope encryption', () => {
  it('round-trips and binds ciphertext to its context', () => {
    const enc = encryptSecret('sk-live-secret-value', 'endpoint-credential:abc');
    expect(enc.ciphertext).not.toContain('sk-live');
    expect(decryptSecret(enc, 'endpoint-credential:abc')).toBe('sk-live-secret-value');
    expect(() => decryptSecret(enc, 'endpoint-credential:other')).toThrow();
  });

  it('detects tampering', () => {
    const enc = encryptSecret('value', 'ctx');
    const tampered = { ...enc, ciphertext: Buffer.from('xxxxx').toString('base64') };
    expect(() => decryptSecret(tampered, 'ctx')).toThrow();
  });

  it('uses a fresh data key and IV per secret', () => {
    const a = encryptSecret('same', 'ctx');
    const b = encryptSecret('same', 'ctx');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
  });
});

describe('API keys', () => {
  it('generates high-entropy keys with a recognizable prefix', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().plaintext));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(looksLikeApiKey(k)).toBe(true);
  });

  it('stores only a keyed hash and a masked display form', () => {
    const k = generateApiKey();
    expect(k.hash).toBe(hashApiKey(k.plaintext));
    expect(k.hash).not.toContain(k.plaintext.slice(4));
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(maskKey(k.prefix, k.last4)).toBe(`${k.plaintext.slice(0, 10)}…${k.plaintext.slice(-4)}`);
  });

  it('rejects malformed keys', () => {
    expect(looksLikeApiKey('nxv_short')).toBe(false);
    expect(looksLikeApiKey('sk-' + 'a'.repeat(40))).toBe(false);
  });
});

describe('password hashing', () => {
  it('verifies correct passwords and rejects others', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
    expect(await verifyPassword('anything', 'garbage')).toBe(false);
  });
});

describe('SSRF protection', () => {
  it.each([
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.16.0.1', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['::1', false],
    ['fc00::1', false],
    ['fe80::1', false],
    ['::ffff:127.0.0.1', false],
    ['::ffff:10.0.0.1', false],
    ['2001:db8::1', false],
    ['8.8.8.8', true],
    ['1.1.1.1', true],
    ['2606:4700:4700::1111', true],
  ])('isPublicAddress(%s) = %s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });

  const strict = { allowHttp: false, allowlist: [] };
  it.each([
    'http://example.com/v1',
    'https://user:pass@example.com/v1',
    'https://localhost/v1',
    'https://127.0.0.1/v1',
    'https://[::1]/v1',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/v1',
    'https://metadata.google.internal/computeMetadata/v1',
    'ftp://example.com/',
    'not a url',
  ])('rejects %s', async (url) => {
    await expect(validateOutboundUrl(url, strict)).rejects.toThrow();
  });

  it('accepts public https IP literals without DNS', async () => {
    await expect(validateOutboundUrl('https://8.8.8.8/v1', strict)).resolves.toBeInstanceOf(URL);
  });

  it('allows explicitly allowlisted private hosts only', async () => {
    await expect(validateOutboundUrl('http://127.0.0.1:8000/v1', { allowHttp: false, allowlist: ['127.0.0.1'] })).resolves.toBeInstanceOf(URL);
  });
});

describe('redaction', () => {
  it('removes common secret formats', () => {
    const text = `key nxv_${'a'.repeat(40)} and sk-proj-${'b'.repeat(30)} bearer abcdefghijklmnopqrstuvwxyz password: hunter2hunter2`;
    const out = redactText(text);
    expect(out).not.toContain('a'.repeat(40));
    expect(out).not.toContain('b'.repeat(30));
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(out).not.toContain('hunter2hunter2');
  });

  it('strips upstream URLs and IPs from provider errors', () => {
    const out = sanitizeUpstreamError('connect ECONNREFUSED 10.0.0.12:443 at https://internal.example/v1/chat');
    expect(out).not.toContain('10.0.0.12');
    expect(out).not.toContain('internal.example');
  });
});

describe('webhook signatures', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ type: 'test.ping', id: 'd1' });

  it('verifies a valid signature', () => {
    expect(verifyWebhookSignature(secret, body, signWebhook(secret, body))).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets and stale timestamps', () => {
    const header = signWebhook(secret, body);
    expect(verifyWebhookSignature(secret, body + ' ', header)).toBe(false);
    expect(verifyWebhookSignature('whsec_other', body, header)).toBe(false);
    const old = signWebhook(secret, body, Math.floor(Date.now() / 1000) - 3600);
    expect(verifyWebhookSignature(secret, body, old)).toBe(false);
    expect(verifyWebhookSignature(secret, body, undefined)).toBe(false);
    expect(verifyWebhookSignature(secret, body, 'garbage')).toBe(false);
  });

  it('matches the documented HMAC construction', () => {
    const t = 1_700_000_000;
    expect(signWebhook(secret, body, t)).toBe(`t=${t},v1=${hmacHex(secret, `${t}.${body}`)}`);
  });
});

describe('Stripe signature verification', () => {
  it('accepts valid and rejects invalid signatures', () => {
    const t = Math.floor(Date.now() / 1000);
    const raw = '{"id":"evt_1"}';
    const header = `t=${t},v1=${hmacHex('whsec_stripe', `${t}.${raw}`)}`;
    expect(verifyStripeSignature(raw, header, 'whsec_stripe')).toBe(true);
    expect(verifyStripeSignature(raw + 'x', header, 'whsec_stripe')).toBe(false);
    expect(verifyStripeSignature(raw, undefined, 'whsec_stripe')).toBe(false);
  });
});

describe('Google OAuth helpers', () => {
  it('builds an authorization URL with PKCE (S256), state and nonce', () => {
    const flow = beginGoogleFlow('/dashboard/usage', 'login');
    const url = new URL(flow.url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    const state = decodeState(flow.cookie)!;
    expect(url.searchParams.get('state')).toBe(state.state);
    expect(url.searchParams.get('nonce')).toBe(state.nonce);
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(state.verifier).digest('base64url'));
    expect(state.redirect).toBe('/dashboard/usage');
  });

  it('rejects tampered or expired state cookies', () => {
    const flow = beginGoogleFlow('/dashboard', 'login');
    const [data] = flow.cookie.split('.');
    expect(decodeState(`${data}.forged`)).toBeNull();
    const expired = encodeState({ state: 's', nonce: 'n', verifier: 'v', redirect: '/', mode: 'login', exp: Date.now() - 1 });
    expect(decodeState(expired)).toBeNull();
    expect(decodeState(undefined)).toBeNull();
  });

  it.each([
    ['/dashboard', '/dashboard'],
    ['/models/llama?x=1', '/models/llama?x=1'],
    ['//evil.com', '/dashboard'],
    ['/\\evil.com', '/dashboard'],
    ['https://evil.com', '/dashboard'],
    ['/api/auth/logout', '/dashboard'],
    [undefined, '/dashboard'],
  ])('safeRedirectPath(%s) = %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
