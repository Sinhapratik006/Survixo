import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processWebhookDeliveries } from '../../src/services/webhookWorker.js';
import { verifyWebhookSignature } from '../../src/security/webhookSignature.js';
import { probeOffer } from '../../src/services/offerValidation.js';
import { createApiKey, ledgerConsistent, prisma, resetDatabase, seedModels, signUp, v1, type Client } from './helpers.js';

const UPSTREAM_KEY = 'sk-test-mock-123456';
const MODEL = 'llama-3.3-70b-instruct';

/** Minimal OpenAI-compatible upstream used to exercise the real adapter. */
function startMockUpstream() {
  const state = { mode: 'ok' as 'ok' | 'fail', lastAuth: '' as string | undefined, chatCalls: 0 };
  const server = http.createServer((req, res) => {
    state.lastAuth = req.headers.authorization;
    if (req.headers.authorization !== `Bearer ${UPSTREAM_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'bad key' } }));
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: 'mock-llama', object: 'model' }] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        state.chatCalls++;
        if (state.mode === 'fail') {
          res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'internal upstream failure at 10.1.2.3' } }));
          return;
        }
        const body = JSON.parse(raw) as { stream?: boolean; model: string };
        if (body.model !== 'mock-llama') {
          res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'model not found' } }));
          return;
        }
        if (body.stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
          send({ choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] });
          for (const w of ['Hello ', 'from ', 'mock']) send({ choices: [{ index: 0, delta: { content: w } }] });
          send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
          send({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 3 } });
          res.end('data: [DONE]\n\n');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'Hello from mock' }, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 3 } }),
        );
      });
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise<{ url: string; state: typeof state; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/v1`, state, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) });
    });
  });
}

function startReceiver() {
  const received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
  const state = { status: 200 };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(state.status).end('ok');
    });
  });
  return new Promise<{ url: string; received: typeof received; state: typeof state; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/hook`, received, state, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) });
    });
  });
}

let upstream: Awaited<ReturnType<typeof startMockUpstream>>;
let seller: Client;
let buyer: Client;

beforeAll(async () => {
  await resetDatabase();
  await seedModels();
  upstream = await startMockUpstream();
  seller = await signUp();
  buyer = await signUp();
});
afterAll(async () => upstream.close());

describe('seller endpoints', () => {
  it('blocks SSRF targets: metadata, private and non-http(s) URLs', async () => {
    for (const baseUrl of ['https://169.254.169.254/v1', 'https://10.0.0.5/v1', 'https://192.168.1.10/v1', 'ftp://example.com/v1', 'https://user:pw@example.com/v1']) {
      const res = await seller.post('/api/sellers/endpoints', { name: 'bad', adapter: 'openai_compatible', baseUrl, apiKey: 'sk-x' });
      expect(res.status, baseUrl).toBe(400);
    }
  });

  let endpointId = '';
  let offerId = '';

  it('verifies an OpenAI-compatible endpoint and encrypts its credential', async () => {
    const res = await seller.post('/api/sellers/endpoints', { name: 'Mock vLLM', adapter: 'openai_compatible', baseUrl: upstream.url, apiKey: UPSTREAM_KEY });
    expect(res.status).toBe(201);
    expect(res.body.endpoint).toMatchObject({ status: 'VERIFIED', discoveredModels: ['mock-llama'], credentialHint: '••••3456' });
    expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_KEY);
    endpointId = res.body.endpoint.id;
    const cred = await prisma.providerCredential.findUniqueOrThrow({ where: { endpointId } });
    expect(JSON.stringify(cred)).not.toContain(UPSTREAM_KEY);
    expect(upstream.state.lastAuth).toBe(`Bearer ${UPSTREAM_KEY}`);
  });

  it('marks endpoints with bad credentials as failed', async () => {
    const res = await seller.post('/api/sellers/endpoints', { name: 'Wrong key', adapter: 'openai_compatible', baseUrl: upstream.url, apiKey: 'sk-wrong-key-000' });
    expect(res.status).toBe(201);
    expect(res.body.endpoint.status).toBe('FAILED');
    expect(res.body.endpoint.statusMessage).toMatch(/auth/);
  });

  it('rejects offers whose model mapping cannot be verified', async () => {
    const res = await seller.post('/api/sellers/offers', { endpointId, modelId: MODEL, upstreamModel: 'gpt-4-pretend', inputPriceUsd: 0.2, outputPriceUsd: 0.3 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unverifiable_mapping');
  });

  it('requires validation before an offer can be activated', async () => {
    const created = await seller.post('/api/sellers/offers', { endpointId, modelId: MODEL, upstreamModel: 'mock-llama', inputPriceUsd: 0.2, outputPriceUsd: 0.3 });
    expect(created.status).toBe(201);
    expect(created.body.offer.status).toBe('DRAFT');
    offerId = created.body.offer.id;

    const early = await seller.post(`/api/sellers/offers/${offerId}/activate`);
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('offer_not_validated');

    const notRoutable = await v1((await createApiKey(buyer)).secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }] });
    expect(notRoutable.status).toBe(503);

    const validated = await seller.post(`/api/sellers/offers/${offerId}/validate`);
    expect(validated.status).toBe(200);
    expect(validated.body.ok).toBe(true);
    expect(validated.body.steps.map((s: { name: string; ok: boolean }) => [s.name, s.ok])).toEqual([
      ['Endpoint verified', true],
      ['Model mapping', true],
      ['Catalog model supports chat', true],
      ['Test completion', true],
      ['Streaming test', true],
    ]);
    expect(validated.body.offer.verifiedCapabilities).toEqual(['chat', 'streaming']);

    const active = await seller.post(`/api/sellers/offers/${offerId}/activate`);
    expect(active.status).toBe(200);
    expect(active.body.offer.status).toBe('ACTIVE');
  });

  it('serves buyer traffic through the real OpenAI-compatible adapter with upstream usage', async () => {
    const key = await createApiKey(buyer);
    const res = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 32 });
    expect(res.status).toBe(200);
    expect(res.body.choices[0].message.content).toBe('Hello from mock');
    expect(res.body.usage).toEqual({ prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 });
    expect(res.body.nexovra.usage_estimated).toBe(false);
    expect(res.body.nexovra.demo).toBe(false);
    // 11 * 0.2 + 3 * 0.3 = 3.1 micro-USD -> rounded up to 4 micros
    expect(res.body.nexovra.cost_usd).toBeCloseTo(0.000004, 9);

    const stream = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, stream: true, messages: [{ role: 'user', content: 'hi' }], max_tokens: 32 });
    const text = stream.text
      .split('\n\n')
      .filter((e) => e.startsWith('data: {'))
      .map((e) => JSON.parse(e.slice(6)).choices?.[0]?.delta?.content ?? '')
      .join('');
    expect(text).toBe('Hello from mock');

    const detail = await seller.get(`/api/models/${MODEL}`);
    expect(detail.body.offers.map((o: { id: string }) => o.id)).toContain(offerId);
  });

  it('handles upstream failures without leaking internals, then recovers via probe', async () => {
    upstream.state.mode = 'fail';
    const key = await createApiKey(buyer);
    const res = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 16 });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('upstream_unavailable');
    expect(JSON.stringify(res.body)).not.toContain('10.1.2.3');
    expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offerId } })).healthStatus).toBe('UNHEALTHY');

    upstream.state.mode = 'ok';
    expect(await probeOffer(offerId)).toBe(true);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offerId } })).healthStatus).toBe('HEALTHY');
  });

  it('pauses offers and requires re-validation when connection details change', async () => {
    const res = await seller.patch(`/api/sellers/endpoints/${endpointId}`, { apiKey: UPSTREAM_KEY });
    expect(res.status).toBe(200);
    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
    expect(offer.status).toBe('PAUSED');
    expect(offer.validatedAt).toBeNull();
  });

  it('records payouts against seller earnings without overdrawing', async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: seller.orgId } });
    expect(org.sellerBalanceMicros).toBeGreaterThan(0n);
    const tooMuch = await seller.post('/api/sellers/payouts', { amountUsd: 1000 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.code).toBe('insufficient_seller_balance');
    await prisma.organization.update({ where: { id: seller.orgId }, data: { sellerBalanceMicros: { increment: 5_000_000n } } });
    await prisma.billingTransaction.create({ data: { orgId: seller.orgId, type: 'ADJUSTMENT', account: 'SELLER', amountMicros: 5_000_000n, description: 'test earnings' } });
    const ok = await seller.post('/api/sellers/payouts', { amountUsd: 2, destination: 'test bank' });
    expect(ok.status).toBe(201);
    expect(ok.body.payout.status).toBe('REQUESTED');
    const list = await seller.get('/api/sellers/payouts');
    expect(list.body.payoutProviderConfigured).toBe(false);
    expect(await ledgerConsistent(seller.orgId)).toBe(true);
  });

  it('supports demo endpoints only as clearly labelled synthetic supply', async () => {
    const res = await seller.post('/api/sellers/endpoints', { name: 'Demo', adapter: 'demo', demoConfig: { latencyMinMs: 1, latencyMaxMs: 5, failureRate: 0 } });
    expect(res.status).toBe(201);
    expect(res.body.endpoint).toMatchObject({ status: 'VERIFIED', baseUrl: 'demo://synthetic' });
    const offer = await seller.post('/api/sellers/offers', { endpointId: res.body.endpoint.id, modelId: 'mistral-7b-instruct-v0.3', upstreamModel: 'mistral-7b-instruct-v0.3', inputPriceUsd: 0.1, outputPriceUsd: 0.1 });
    expect(offer.body.offer.isDemo).toBe(true);
  });
});

describe('webhooks', () => {
  let receiver: Awaited<ReturnType<typeof startReceiver>>;
  let secret = '';
  let webhookId = '';
  beforeAll(async () => {
    receiver = await startReceiver();
  });
  afterAll(async () => receiver.close());

  it('rejects unsafe webhook URLs', async () => {
    const res = await buyer.post('/api/webhooks', { url: 'https://169.254.169.254/hook', events: ['test.ping'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unsafe_url');
  });

  it('delivers signed events that receivers can verify', async () => {
    const created = await buyer.post('/api/webhooks', { url: receiver.url, events: ['test.ping', 'key.revoked'] });
    expect(created.status).toBe(201);
    secret = created.body.secret;
    webhookId = created.body.webhook.id;
    expect(secret).toMatch(/^whsec_/);
    expect(JSON.stringify(await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: webhookId } }))).not.toContain(secret);

    expect((await buyer.post(`/api/webhooks/${webhookId}/test`)).status).toBe(202);
    const key = await createApiKey(buyer, { name: 'webhook key' });
    await buyer.post(`/api/api-keys/${key.id}/revoke`);
    await processWebhookDeliveries();

    expect(receiver.received.length).toBe(2);
    for (const r of receiver.received) {
      expect(verifyWebhookSignature(secret, r.body, r.headers['nexovra-signature'] as string)).toBe(true);
      expect(verifyWebhookSignature('whsec_wrong', r.body, r.headers['nexovra-signature'] as string)).toBe(false);
    }
    const events = receiver.received.map((r) => JSON.parse(r.body).type).sort();
    expect(events).toEqual(['key.revoked', 'test.ping']);
    const deliveries = await buyer.get(`/api/webhooks/${webhookId}/deliveries`);
    expect(deliveries.body.data.every((d: { status: string }) => d.status === 'SUCCESS')).toBe(true);
  });

  it('retries failed deliveries with backoff and keeps a delivery log', async () => {
    receiver.state.status = 500;
    await buyer.post(`/api/webhooks/${webhookId}/test`);
    await processWebhookDeliveries();
    const d = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: webhookId }, orderBy: { createdAt: 'desc' } });
    expect(d.status).toBe('PENDING');
    expect(d.attempts).toBe(1);
    expect(d.responseStatus).toBe(500);
    expect(d.lastError).toMatch(/HTTP 500/);
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

    receiver.state.status = 200;
    expect((await buyer.post(`/api/webhooks/deliveries/${d.id}/retry`)).status).toBe(202);
    await processWebhookDeliveries();
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('SUCCESS');
  });

  it('shows notifications in the alert center', async () => {
    const alerts = await buyer.get('/api/alerts');
    expect(alerts.status).toBe(200);
    expect(alerts.body.data.some((n: { type: string }) => n.type === 'key.revoked')).toBe(true);
    await buyer.post('/api/alerts/read-all');
    expect((await buyer.get('/api/alerts')).body.unread).toBe(0);
  });
});
