import { beforeAll, describe, expect, it } from 'vitest';
import { createApiKey, createDemoSeller, fund, ledgerConsistent, prisma, resetDatabase, seedModels, signUp, v1, type Client } from './helpers.js';

const MODEL = 'llama-3.1-8b-instruct';
let buyer: Client;
let key: { id: string; secret: string };
let cheapSellerOrg: string;
let pricierSellerOrg: string;

beforeAll(async () => {
  await resetDatabase();
  await seedModels();
  cheapSellerOrg = (await createDemoSeller({ slug: 'cheap-seller', models: [MODEL, 'mistral-7b-instruct-v0.3'], inputPriceUsd: 0.05, outputPriceUsd: 0.08 })).org.id;
  pricierSellerOrg = (await createDemoSeller({ slug: 'pricier-seller', models: [MODEL], inputPriceUsd: 0.1, outputPriceUsd: 0.15 })).org.id;
  buyer = await signUp();
  key = await createApiKey(buyer);
});

describe('API keys', () => {
  it('returns the plaintext key exactly once and stores only a hash', async () => {
    expect(key.secret).toMatch(/^nxv_[0-9A-Za-z]{40}$/);
    const list = await buyer.get('/api/api-keys');
    expect(list.status).toBe(200);
    const listed = list.body.data.find((k: { id: string }) => k.id === key.id);
    expect(listed.maskedKey).toMatch(/^nxv_\w{6}…\w{4}$/);
    expect(JSON.stringify(list.body)).not.toContain(key.secret);
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(key.secret.slice(4));
  });

  it('authenticates the /v1 API and rejects missing or invalid keys', async () => {
    expect((await v1(key.secret).get('/v1/models')).status).toBe(200);
    const missing = await v1('').get('/v1/models').set('authorization', '');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('missing_api_key');
    const invalid = await v1(`nxv_${'x'.repeat(40)}`).get('/v1/models');
    expect(invalid.status).toBe(401);
    expect(invalid.body.error).toMatchObject({ code: 'invalid_api_key', type: 'authentication_error' });
  });

  it('lists only API-supported models in OpenAI format', async () => {
    const res = await v1(key.secret).get('/v1/models');
    expect(res.body.object).toBe('list');
    const ids = res.body.data.map((m: { id: string }) => m.id);
    expect(ids).toContain(MODEL);
    expect(ids).not.toContain('flux-1-schnell');
    expect(res.body.data[0]).toHaveProperty('nexovra.capabilities');
  });
});

describe('chat completions, routing and billing', () => {
  it('routes to the cheapest eligible offer and bills exactly the reported usage', async () => {
    const before = await prisma.organization.findUniqueOrThrow({ where: { id: buyer.orgId } });
    const sellerBefore = await prisma.organization.findUniqueOrThrow({ where: { id: cheapSellerOrg } });
    const res = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'Hello there' }], max_tokens: 64 });
    expect(res.status).toBe(200);
    expect(res.body.object).toBe('chat.completion');
    expect(res.body.choices[0].message.content).toMatch(/Demo response/);
    expect(res.body.nexovra.seller).toBe('Seller cheap-seller');
    expect(res.body.nexovra.routing_reason).toMatch(/lowest estimated cost/);
    expect(res.headers['x-nexovra-request-id']).toBe(res.body.nexovra.request_id);

    const reqRow = await prisma.inferenceRequest.findUniqueOrThrow({ where: { id: res.body.nexovra.request_id } });
    expect(reqRow.status).toBe('SUCCESS');
    expect(reqRow.inputTokens).toBe(res.body.usage.prompt_tokens);
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: buyer.orgId } });
    const sellerAfter = await prisma.organization.findUniqueOrThrow({ where: { id: cheapSellerOrg } });
    expect(before.balanceMicros - after.balanceMicros).toBe(reqRow.costMicros);
    expect(after.heldMicros).toBe(0n);
    expect(sellerAfter.sellerBalanceMicros - sellerBefore.sellerBalanceMicros).toBe(reqRow.sellerEarningMicros);
    expect(reqRow.sellerEarningMicros + reqRow.platformFeeMicros).toBe(reqRow.costMicros);
    expect(await ledgerConsistent(buyer.orgId)).toBe(true);
    expect(await ledgerConsistent(cheapSellerOrg)).toBe(true);

    const usage = await prisma.usageRecord.findFirst({ where: { orgId: buyer.orgId, apiKeyId: key.id, modelId: MODEL } });
    expect(usage?.requests).toBe(1);
    expect(usage?.costMicros).toBe(reqRow.costMicros);
  });

  it('exposes a request trace with the routing decision and attempts', async () => {
    const res = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'trace me' }], max_tokens: 16 });
    const trace = await v1(key.secret).get(`/v1/requests/${res.body.nexovra.request_id}`);
    expect(trace.status).toBe(200);
    expect(trace.body.trace.ranked.length).toBe(2);
    expect(trace.body.trace.explanation).toMatch(/Selected/);
    expect(trace.body.attempts).toHaveLength(1);
    expect(trace.body.attempts[0].ok).toBe(true);
  });

  it('streams OpenAI-compatible SSE with a final usage chunk', async () => {
    const res = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, stream: true, messages: [{ role: 'user', content: 'stream please' }], max_tokens: 64 });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = res.text.split('\n\n').filter(Boolean).map((e) => e.replace(/^data: /, ''));
    expect(events[events.length - 1]).toBe('[DONE]');
    const usageChunk = JSON.parse(events[events.length - 2]!);
    expect(usageChunk.usage.completion_tokens).toBeGreaterThan(0);
    expect(usageChunk.nexovra.cost_usd).toBeGreaterThan(0);
    const text = events
      .slice(0, -2)
      .map((e) => JSON.parse(e).choices?.[0]?.delta?.content ?? '')
      .join('');
    expect(text).toMatch(/Demo response/);
    expect(await ledgerConsistent(buyer.orgId)).toBe(true);
  });

  it('honours routing mode overrides via header and preferred providers', async () => {
    const res = await v1(key.secret).post(
      '/v1/chat/completions',
      { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 16, nexovra: { preferred_providers: ['pricier-seller'] } },
      { 'x-nexovra-routing': 'preferred-provider' },
    );
    expect(res.status).toBe(200);
    expect(res.body.nexovra.routing_mode).toBe('PREFERRED_PROVIDER');
    expect(res.body.nexovra.seller).toBe('Seller pricier-seller');
  });

  it('returns clear errors instead of routing to incompatible offers', async () => {
    const unknown = await v1(key.secret).post('/v1/chat/completions', { model: 'gpt-nonexistent', messages: [{ role: 'user', content: 'x' }] });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('model_not_found');

    const vision = await v1(key.secret).post('/v1/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'what is this' }, { type: 'image_url', image_url: { url: 'https://example.com/cat.png' } }] }],
    });
    expect(vision.status).toBe(503);
    expect(vision.body.error.code).toBe('no_eligible_offer');
    expect(vision.body.error.message).toMatch(/vision/);

    const noOffers = await v1(key.secret).post('/v1/chat/completions', { model: 'gemma-2-27b-it', messages: [{ role: 'user', content: 'x' }] });
    expect(noOffers.status).toBe(404);
    expect(noOffers.body.error.code).toBe('no_offers_for_model');

    const catalogOnly = await v1(key.secret).post('/v1/chat/completions', { model: 'bge-m3', messages: [{ role: 'user', content: 'x' }] });
    expect(catalogOnly.status).toBe(400);
    expect(catalogOnly.body.error.code).toBe('unsupported_model');

    const minDiscount = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'x' }] }, { 'x-min-discount': '99' });
    expect(minDiscount.status).toBe(503);

    const invalid = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.type).toBe('invalid_request_error');

    // Routing-level rejections are recorded with a trace (validation errors are not).
    const rejected = await prisma.inferenceRequest.findMany({ where: { orgId: buyer.orgId, status: 'REJECTED' } });
    expect(rejected.map((r) => r.errorCode).sort()).toEqual(['no_eligible_offer', 'no_eligible_offer', 'no_offers_for_model']);
    expect(rejected.every((r) => r.routingTrace !== null && r.costMicros === 0n)).toBe(true);
    expect(await ledgerConsistent(buyer.orgId)).toBe(true);
  });

  it('agent mode: max_cost_usd caps max_tokens so the charge never exceeds the budget', async () => {
    const res = await v1(key.secret).post('/v1/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: 'Write a very long essay about routing.' }],
      max_tokens: 4000,
      nexovra: { max_cost_usd: 0.00002 },
    });
    expect(res.status).toBe(200);
    expect(res.body.nexovra.cost_usd).toBeLessThanOrEqual(0.00002);
    const tooLow = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'x'.repeat(4000) }], nexovra: { max_cost_usd: 0.0000001 } });
    expect(tooLow.status).toBe(402);
    expect(tooLow.body.error.code).toBe('max_cost_too_low');
  });

  it('supports model "auto" with required capabilities', async () => {
    const res = await v1(key.secret).post('/v1/chat/completions', { model: 'auto', messages: [{ role: 'user', content: 'hi' }], max_tokens: 16, nexovra: { routing_mode: 'lowest_cost' } });
    expect(res.status).toBe(200);
    expect(['llama-3.1-8b-instruct', 'mistral-7b-instruct-v0.3']).toContain(res.body.model);
  });

  it('prevents duplicate execution and billing with Idempotency-Key', async () => {
    const body = { model: MODEL, messages: [{ role: 'user', content: 'only once' }], max_tokens: 16 };
    const first = await v1(key.secret).post('/v1/chat/completions', body, { 'idempotency-key': 'order-123' });
    const second = await v1(key.secret).post('/v1/chat/completions', body, { 'idempotency-key': 'order-123' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('idempotency_conflict');
    expect(await prisma.billingTransaction.count({ where: { requestId: first.body.nexovra.request_id, type: 'USAGE_DEBIT' } })).toBe(1);
  });

  it('handles concurrent duplicates without errors or stranded holds', async () => {
    const body = { model: MODEL, messages: [{ role: 'user', content: 'race' }], max_tokens: 16 };
    const results = await Promise.all(Array.from({ length: 4 }, () => v1(key.secret).post('/v1/chat/completions', body, { 'idempotency-key': 'race-1' })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409]);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: buyer.orgId } });
    expect(org.heldMicros).toBe(0n);
    expect(await ledgerConsistent(buyer.orgId)).toBe(true);
  });
});

describe('failover and failures', () => {
  it('retries on the next eligible offer when a seller fails, billing once', async () => {
    const flaky = await createDemoSeller({ slug: 'flaky-seller', models: [MODEL], inputPriceUsd: 0.01, outputPriceUsd: 0.01, failureRate: 1 });
    const res = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'failover' }], max_tokens: 16 });
    expect(res.status).toBe(200);
    expect(res.body.nexovra.retries).toBe(1);
    expect(res.body.nexovra.seller).not.toBe('Seller flaky-seller');
    const attempts = await prisma.requestAttempt.findMany({ where: { requestId: res.body.nexovra.request_id }, orderBy: { attempt: 'asc' } });
    expect(attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(attempts[0]!.offerId).toBe(flaky.offers[0]!.id);
    expect(await prisma.billingTransaction.count({ where: { requestId: res.body.nexovra.request_id } })).toBe(2); // buyer debit + seller earning
    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: flaky.offers[0]!.id } });
    expect(offer.healthStatus).toBe('UNHEALTHY');
    expect(offer.unhealthyUntil!.getTime()).toBeGreaterThan(Date.now());
    const notification = await prisma.notification.findFirst({ where: { orgId: flaky.org.id, type: 'offer.failed' } });
    expect(notification).not.toBeNull();
    expect(await ledgerConsistent(buyer.orgId)).toBe(true);
  });

  it('returns 502 and charges nothing when every eligible offer fails', async () => {
    await createDemoSeller({ slug: 'broken-seller', models: ['phi-3.5-mini-instruct'], inputPriceUsd: 0.01, outputPriceUsd: 0.01, failureRate: 1 });
    const before = await prisma.organization.findUniqueOrThrow({ where: { id: buyer.orgId } });
    const res = await v1(key.secret).post('/v1/chat/completions', { model: 'phi-3.5-mini-instruct', messages: [{ role: 'user', content: 'x' }], max_tokens: 16 });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('upstream_unavailable');
    const after = await prisma.organization.findUniqueOrThrow({ where: { id: buyer.orgId } });
    expect(after.balanceMicros).toBe(before.balanceMicros);
    expect(after.heldMicros).toBe(0n);
    const row = await prisma.inferenceRequest.findUniqueOrThrow({ where: { id: res.body.error.details.request_id } });
    expect(row.status).toBe('FAILED');
    expect(row.costMicros).toBe(0n);
  });
});

describe('Smart Budget Guard and spending limits (server-side)', () => {
  it('enforces per-key spending limits', async () => {
    const limited = await createApiKey(buyer, { name: 'limited', spendLimitUsd: 0.000001 });
    const res = await v1(limited.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 64 });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('key_spend_limit_exceeded');
  });

  it('enforces daily hard limits and per-request caps', async () => {
    const put = await buyer.put('/api/billing/budget', { dailyLimitUsd: 0.000001, alertThresholds: [50, 100], hardLimit: true });
    expect(put.status).toBe(200);
    const blocked = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 64 });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe('daily_budget_exceeded');

    await buyer.put('/api/billing/budget', { maxPerRequestUsd: 0.0000001, hardLimit: true });
    const capped = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'x'.repeat(2000) }], max_tokens: 64 });
    expect(capped.status).toBe(402);

    await buyer.put('/api/billing/budget', { hardLimit: false });
    const ok = await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 16 });
    expect(ok.status).toBe(200);
  });

  it('fires a budget threshold alert once per period', async () => {
    await buyer.put('/api/billing/budget', { dailyLimitUsd: 0.000001, alertThresholds: [100], hardLimit: false });
    await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 16 });
    await v1(key.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 16 });
    await new Promise((r) => setTimeout(r, 300));
    const alerts = await prisma.notification.findMany({ where: { orgId: buyer.orgId, type: 'budget.threshold' } });
    expect(alerts.length).toBe(1);
    await buyer.put('/api/billing/budget', { hardLimit: false });
  });

  it('rejects requests when the balance cannot cover the worst-case hold', async () => {
    const team = await buyer.post('/api/orgs', { name: 'Empty Team' });
    const teamKey = await createApiKey(buyer, { name: 'team key' }, team.body.org.id);
    const res = await v1(teamKey.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 64 });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('insufficient_balance');
    await fund(team.body.org.id, 1);
    const ok = await v1(teamKey.secret).post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 64 });
    expect(ok.status).toBe(200);
  });

  it('applies per-key rate limits', async () => {
    const slow = await createApiKey(buyer, { name: 'slow', rpmLimit: 2 });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await v1(slow.secret).get('/v1/models')).status);
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe('key lifecycle and tenant isolation', () => {
  it('revoked keys stop working immediately and emit a key.revoked event', async () => {
    const k = await createApiKey(buyer, { name: 'to revoke' });
    expect((await buyer.post(`/api/api-keys/${k.id}/revoke`)).status).toBe(200);
    const res = await v1(k.secret).get('/v1/models');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('api_key_revoked');
    expect(await prisma.notification.count({ where: { orgId: buyer.orgId, type: 'key.revoked' } })).toBeGreaterThan(0);
  });

  it('rotation issues a new key and revokes the old one', async () => {
    const k = await createApiKey(buyer, { name: 'rotate me' });
    const rotated = await buyer.post(`/api/api-keys/${k.id}/rotate`);
    expect(rotated.status).toBe(201);
    expect(rotated.body.secret).not.toBe(k.secret);
    expect((await v1(k.secret).get('/v1/models')).status).toBe(401);
    expect((await v1(rotated.body.secret).get('/v1/models')).status).toBe(200);
  });

  it('users cannot read another organization’s data', async () => {
    const other = await signUp();
    const { data } = (await buyer.get('/api/usage/requests')).body as { data: Array<{ id: string }> };
    const foreign = await other.get(`/api/usage/requests/${data[0]!.id}`);
    expect(foreign.status).toBe(404);
    const spoofed = await other.get('/api/usage/summary', buyer.orgId);
    expect(spoofed.status).toBe(403);
    expect(spoofed.body.error.code).toBe('not_a_member');
    const otherKey = await createApiKey(other);
    expect((await v1(otherKey.secret).get(`/v1/requests/${data[0]!.id}`)).status).toBe(404);
  });

  it('enforces role-based permissions on the backend', async () => {
    const team = await buyer.post('/api/orgs', { name: 'RBAC Team' });
    const viewer = await signUp();
    expect((await buyer.post('/api/orgs/current/members', { email: viewer.email, role: 'VIEWER' }, team.body.org.id)).status).toBe(201);
    const create = await viewer.post('/api/api-keys', { name: 'nope' }, team.body.org.id);
    expect(create.status).toBe(403);
    expect((await viewer.get('/api/usage/summary', team.body.org.id)).status).toBe(200);
    expect((await viewer.put('/api/billing/budget', { dailyLimitUsd: 1 }, team.body.org.id)).status).toBe(403);
    expect((await viewer.post('/api/sellers/endpoints', { name: 'x', adapter: 'demo' }, team.body.org.id)).status).toBe(403);
    // The last owner cannot be demoted.
    const me = (await buyer.get('/api/auth/me')).body.user.id as string;
    expect((await buyer.patch(`/api/orgs/current/members/${me}`, { role: 'ADMIN' }, team.body.org.id)).status).toBe(400);
    const audit = await buyer.get('/api/orgs/current/audit', team.body.org.id);
    expect(audit.body.data.map((a: { action: string }) => a.action)).toContain('member.added');
  });
});

describe('usage reporting and accounting consistency', () => {
  it('reports usage per key and model consistent with requests and the ledger', async () => {
    const summary = await buyer.get('/api/usage/summary?days=7');
    expect(summary.status).toBe(200);
    const requests = await prisma.inferenceRequest.aggregate({ where: { orgId: buyer.orgId, status: 'SUCCESS' }, _sum: { costMicros: true } });
    const debits = await prisma.billingTransaction.aggregate({ where: { orgId: buyer.orgId, type: 'USAGE_DEBIT' }, _sum: { amountMicros: true } });
    expect(-(debits._sum.amountMicros ?? 0n)).toBe(requests._sum.costMicros ?? 0n);
    expect(summary.body.totals.costUsd).toBeCloseTo(Number(requests._sum.costMicros) / 1e6, 6);
    const apiUsage = await v1(key.secret).get('/v1/usage?days=7');
    expect(apiUsage.body.by_model.find((m: { model: string }) => m.model === MODEL).requests).toBeGreaterThan(3);
    for (const org of [buyer.orgId, cheapSellerOrg, pricierSellerOrg]) expect(await ledgerConsistent(org)).toBe(true);
  });

  it('dashboard summary and CSV export work', async () => {
    const dash = await buyer.get('/api/dashboard/summary');
    expect(dash.status).toBe(200);
    expect(dash.body.last30d.requests).toBeGreaterThan(0);
    const csv = await buyer.get('/api/usage/export.csv?days=7');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toMatch(/^request_id,created_at,status/);
  });

  it('playground uses the same pipeline with session auth', async () => {
    const res = await buyer.post('/api/playground/chat', { model: MODEL, messages: [{ role: 'user', content: 'from the playground' }], max_tokens: 16 });
    expect(res.status).toBe(200);
    const row = await prisma.inferenceRequest.findUniqueOrThrow({ where: { id: res.body.nexovra.request_id } });
    expect(row.source).toBe('PLAYGROUND');
    expect(row.apiKeyId).toBeNull();
  });

  it('arena requires explicit consent and runs models side by side', async () => {
    const noConsent = await buyer.post('/api/playground/arena/run', { prompt: 'compare', modelIds: [MODEL, 'mistral-7b-instruct-v0.3'] });
    expect(noConsent.status).toBe(400);
    const ok = await buyer.post('/api/playground/arena/run', { prompt: 'compare', modelIds: [MODEL, 'mistral-7b-instruct-v0.3'], consent: true, maxTokens: 32 });
    expect(ok.status).toBe(200);
    expect(ok.body.results).toHaveLength(2);
    expect(ok.body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    const rate = await buyer.post(`/api/playground/arena/${ok.body.sessionId}/ratings`, { ratings: [{ requestId: ok.body.results[0].requestId, rating: 4, scores: { Accuracy: 4 } }] });
    expect(rate.status).toBe(200);
    const session = await prisma.arenaSession.findUniqueOrThrow({ where: { id: ok.body.sessionId } });
    expect(session.promptHash).toHaveLength(64); // prompt itself is not stored
  });

  it('model match, optimizer and routing simulation respond with explanations', async () => {
    const match = await buyer.post('/api/playground/assistant/match', { task: 'Summarize 200-page PDFs with accurate citations at low cost.' });
    expect(match.status).toBe(200);
    expect(match.body.analysis.minContextTokens).toBe(120000);
    for (const r of match.body.recommendations) expect(r.model.contextWindow === null || r.model.contextWindow >= 120000).toBe(true);
    const opt = await buyer.get('/api/playground/optimizer');
    expect(opt.status).toBe(200);
    expect(opt.body.note).toMatch(/Nothing changes until you approve/);
    const sim = await buyer.post('/api/routing/simulate', { model: MODEL });
    expect(sim.status).toBe(200);
    expect(sim.body.trace.ranked.length).toBeGreaterThan(0);
  });
});
