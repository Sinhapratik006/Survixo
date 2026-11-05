/**
 * The key probe talks HTTP to a seller-supplied base URL, so this file opts
 * into loopback targets before the config module (which reads the
 * environment at import time) is loaded.
 */
process.env.ALLOW_INSECURE_ENDPOINTS = 'true';
process.env.PRIVATE_ENDPOINT_ALLOWLIST = '127.0.0.1';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

const { checkListingKey, inspectKeyFormat, probeHeaders } = await import('../../src/services/listingKeyHealth.js');

const VALID_KEY = 'sk-live-abc123def456ghi789jkl012';

let server: Server;
let baseUrl = '';
let handler: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => {
  res.statusCode = 404;
  res.end();
};

/** A port nothing is listening on, for the unreachable-provider case. */
async function unusedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('inspectKeyFormat', () => {
  it('rejects empty and placeholder values', () => {
    expect(inspectKeyFormat('').ok).toBe(false);
    expect(inspectKeyFormat('   ').ok).toBe(false);
    expect(inspectKeyFormat('sk-...').ok).toBe(false);
    expect(inspectKeyFormat('your-api-key').ok).toBe(false);
    expect(inspectKeyFormat('test').ok).toBe(false);
  });

  it('rejects values that are not key-shaped at all', () => {
    expect(inspectKeyFormat('short').ok).toBe(false);
    expect(inspectKeyFormat('has spaces inside the value').ok).toBe(false);
    expect(inspectKeyFormat('{"apiKey":"sk-1234567890123456"}').ok).toBe(false);
    expect(inspectKeyFormat('<script>alert(1)</script>').ok).toBe(false);
    expect(inspectKeyFormat('line1\nline2-line3-line4').ok).toBe(false);
  });

  it('accepts a plausible credential', () => {
    expect(inspectKeyFormat(`  ${VALID_KEY}\n`)).toEqual({ ok: true, reason: null });
  });
});

describe('probeHeaders', () => {
  const KEY = 'sk-live-abc123def456ghi789jkl012';

  it('sends the Anthropic version header only to Anthropic hosts', () => {
    // Regression: NVIDIA's catalogue answers requests carrying this foreign
    // header with an empty model list, failing the check for the wrong reason.
    expect(probeHeaders(KEY, 'https://api.anthropic.com/v1')['anthropic-version']).toBe('2023-06-01');
    expect(probeHeaders(KEY, 'https://api.anthropic.com')['anthropic-version']).toBe('2023-06-01');
    expect(probeHeaders(KEY, 'https://integrate.api.nvidia.com/v1')['anthropic-version']).toBeUndefined();
    expect(probeHeaders(KEY, 'https://api.openai.com/v1')['anthropic-version']).toBeUndefined();
    expect(probeHeaders(KEY)['anthropic-version']).toBeUndefined();
  });

  it('always carries both key styles', () => {
    const h = probeHeaders(KEY, 'https://api.openai.com/v1');
    expect(h.authorization).toBe(`Bearer ${KEY}`);
    expect(h['x-api-key']).toBe(KEY);
  });
});

describe('checkListingKey', () => {
  it('accepts a key the provider authenticates', async () => {
    handler = (req, res) => {
      if (req.url === '/models' && req.headers.authorization === `Bearer ${VALID_KEY}`) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }));
        return;
      }
      res.statusCode = 401;
      res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
    };

    const result = await checkListingKey({ apiKey: VALID_KEY, baseUrl });
    expect(result.ok).toBe(true);
    expect(result.provider).toContain('127.0.0.1');
    expect(result.modelCount).toBe(2);
    expect(result.sampleModels).toContain('gpt-4o');
    expect(result.detail).toContain('Verified');
  });

  it('accepts a key even when the seller omits the base URL', async () => {
    handler = (req, res) => {
      // Auth-enforcing endpoint: the control probe (invalid key) gets a 401.
      if (req.headers.authorization === `Bearer ${VALID_KEY}`) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'model-a' }] }));
        return;
      }
      res.statusCode = 401;
      res.end('{}');
    };

    const result = await checkListingKey({
      apiKey: VALID_KEY,
      probes: [{ name: 'Mock provider', baseUrl }],
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('Mock provider');
    expect(result.modelCount).toBe(1);
  });

  it('rejects a key the provider refuses', async () => {
    handler = (_req, res) => {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
    };

    const result = await checkListingKey({ apiKey: VALID_KEY, baseUrl });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('rejected this key');
    expect(result.detail).toContain('401');
  });

  it('rejects a provider that returns no models', async () => {
    handler = (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: [] }));
    };

    const result = await checkListingKey({ apiKey: VALID_KEY, baseUrl });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('empty model list');
  });

  it('rejects a key that does not serve the models the seller listed', async () => {
    handler = (req, res) => {
      if (req.headers.authorization === `Bearer ${VALID_KEY}`) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'gpt-4o' }] }));
        return;
      }
      res.statusCode = 401;
      res.end('{}');
    };

    const rejected = await checkListingKey({ apiKey: VALID_KEY, baseUrl, models: ['claude-3-opus'] });
    expect(rejected.ok).toBe(false);
    expect(rejected.detail).toContain('does not serve any of the models you listed');

    // Substring matching keeps friendly names like "gpt-4" working.
    const accepted = await checkListingKey({ apiKey: VALID_KEY, baseUrl, models: ['gpt-4'] });
    expect(accepted.ok).toBe(true);
  });

  it('fails closed when the provider cannot be reached', async () => {
    const port = await unusedPort();
    const result = await checkListingKey({ apiKey: VALID_KEY, baseUrl: `http://127.0.0.1:${port}` });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('Could not verify the key');
  });

  it('rejects a key the auth endpoint refuses, even when /models is public', async () => {
    // OpenRouter-style provider: anyone may list models, only a valid key
    // gets a 200 from the auth endpoint. The public list must not vouch for
    // a garbage credential.
    handler = (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/key') {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
        return;
      }
      res.end(JSON.stringify({ data: [{ id: 'gpt-4o' }] }));
    };

    const result = await checkListingKey({
      apiKey: VALID_KEY,
      probes: [{ name: 'Public-list provider', baseUrl, authPath: '/key' }],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a key the auth endpoint confirms on a provider with a public list', async () => {
    handler = (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/key') {
        // Like OpenRouter's /key: demands a credential even though /models
        // below is public.
        if (req.headers.authorization === `Bearer ${VALID_KEY}`) {
          res.end(JSON.stringify({ data: { label: 'seller-key' } }));
          return;
        }
        res.statusCode = 401;
        res.end('{}');
        return;
      }
      res.end(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }));
    };

    const result = await checkListingKey({
      apiKey: VALID_KEY,
      probes: [{ name: 'Public-list provider', baseUrl, authPath: '/key' }],
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('Public-list provider');
    expect(result.modelCount).toBe(2);
  });

  it('fails closed when the auth endpoint errors', async () => {
    handler = (_req, res) => {
      res.statusCode = 500;
      res.end('boom');
    };

    const result = await checkListingKey({
      apiKey: VALID_KEY,
      probes: [{ name: 'Broken auth provider', baseUrl, authPath: '/key' }],
    });
    expect(result.ok).toBe(false);
  });

  it('never probes the network for garbage input', async () => {
    const result = await checkListingKey({
      apiKey: 'this is definitely not a valid key',
      // If the format gate were skipped this would try to reach the target.
      probes: [{ name: 'Mock provider', baseUrl }],
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('spaces or line breaks');
  });

  it('names the providers and the reason when every default probe refuses', async () => {
    handler = (_req, res) => {
      res.statusCode = 401;
      res.end('{}');
    };

    const result = await checkListingKey({
      apiKey: VALID_KEY,
      probes: [
        { name: 'Alpha', baseUrl },
        { name: 'Beta', baseUrl },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('We could not verify this key against any supported provider');
    expect(result.detail).toContain('Alpha, Beta: rejected the key (HTTP 401)');
    expect(result.detail).toContain('Set the API base URL your key belongs to');
  });

  it('separates providers that refused from providers that errored', async () => {
    handler = (_req, res) => {
      res.statusCode = 401;
      res.end('{}');
    };
    const deadPort = await unusedPort();

    const result = await checkListingKey({
      apiKey: VALID_KEY,
      probes: [
        { name: 'Alpha', baseUrl },
        { name: 'Unreachable', baseUrl: `http://127.0.0.1:${deadPort}` },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('Alpha: rejected the key (HTTP 401)');
    expect(result.detail).toMatch(/Unreachable: .+/);
    expect(result.detail).not.toContain('Alpha, Unreachable');
  });

  it('rejects a key when the endpoint accepts a different invalid key too', async () => {
    // NVIDIA-style public catalogue: /models answers 200 to everyone, so a
    // garbage key looks identical to a real one. The differential control
    // (same request, invalid key) must refuse to let it vouch.
    handler = (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: [{ id: 'public-model' }] }));
    };

    const result = await checkListingKey({ apiKey: VALID_KEY, baseUrl });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('accepted a different invalid key');
  });

  it('rejects a key when even the auth path answers every credential', async () => {
    handler = (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/key') {
        res.end(JSON.stringify({ data: { label: 'anyone' } })); // no credential check
        return;
      }
      res.end(JSON.stringify({ data: [{ id: 'gpt-4o' }] }));
    };

    const result = await checkListingKey({
      apiKey: VALID_KEY,
      probes: [{ name: 'Open-list provider', baseUrl, authPath: '/key' }],
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('accepted a different invalid key');
    expect(result.detail).toContain('Open-list provider');
  });
});
