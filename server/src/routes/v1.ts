import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { microsToUsd } from '../lib/money.js';
import { createSseSink } from '../lib/sse.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { rateLimit, ipKey } from '../middleware/rateLimit.js';
import { InferenceError, runChatCompletion } from '../services/inference.js';
import { getCatalog, type CatalogModel } from '../services/catalog.js';
import { serializeRequest } from './usage.js';

export const v1Router = Router();

v1Router.use(rateLimit({ name: 'v1-ip', windowSeconds: 60, max: 1200, key: ipKey }));
v1Router.use(apiKeyAuth);
v1Router.use(
  rateLimit({
    name: 'v1-key',
    windowSeconds: 60,
    max: (req) => req.apiKeyAuth?.rpmLimit ?? 600,
    key: (req) => req.apiKeyAuth?.id ?? null,
  }),
);
v1Router.use(rateLimit({ name: 'v1-org', windowSeconds: 60, max: 3000, key: (req) => req.apiKeyAuth?.orgId ?? null }));

function toOpenAiModel(m: CatalogModel) {
  return {
    id: m.id,
    object: 'model',
    created: 0,
    owned_by: m.provider.id,
    nexovra: {
      name: m.name,
      context_window: m.contextWindow,
      max_output_tokens: m.maxOutputTokens,
      input_modalities: m.inputModalities,
      output_modalities: m.outputModalities,
      capabilities: m.capabilities.map((c) => ({ name: c.capability, status: c.status })),
      baseline_price_usd_per_m: m.baseline ? { input: m.baseline.inputPerM, output: m.baseline.outputPerM, demo: m.baseline.isDemo } : null,
      best_offer_usd_per_m: m.bestOffer ? { input: m.bestOffer.inputPerM, output: m.bestOffer.outputPerM, demo: m.bestOffer.isDemo } : null,
      healthy_offers: m.healthyOfferCount,
    },
  };
}

v1Router.get('/models', async (_req, res) => {
  const catalog = (await getCatalog()).filter((m) => m.apiSupported);
  res.json({ object: 'list', data: catalog.map(toOpenAiModel) });
});

v1Router.get('/models/:id', async (req, res) => {
  const wanted = String(req.params.id).toLowerCase();
  const m = (await getCatalog()).find((x) => x.id.toLowerCase() === wanted || x.aliases.includes(wanted));
  if (!m || !m.apiSupported) throw notFound(`Model "${String(req.params.id)}" not found`, 'model_not_found');
  res.json(toOpenAiModel(m));
});

v1Router.post('/chat/completions', async (req, res) => {
  const key = req.apiKeyAuth!;
  const ctx = {
    orgId: key.orgId,
    apiKey: { id: key.id, spendLimitMicros: key.spendLimitMicros, spentMicros: key.spentMicros, projectId: key.projectId },
    source: 'API' as const,
    idempotencyKey: req.get('idempotency-key')?.slice(0, 200) ?? null,
    headerRoutingMode: req.get('x-nexovra-routing') ?? null,
    headerMinDiscount: req.get('x-min-discount') ?? null,
    headerTaskId: req.get('x-nexovra-task-id')?.slice(0, 128) ?? null,
  };
  if (req.body?.stream === true) {
    const sink = createSseSink(req, res);
    try {
      await runChatCompletion(ctx, req.body, sink);
    } catch (err) {
      if (!res.headersSent) throw err;
      const e = err instanceof InferenceError ? err : new InferenceError(500, 'internal_error', 'Stream failed');
      sink.send({ error: { message: e.message, type: e.status >= 500 ? 'api_error' : 'invalid_request_error', code: e.code, request_id: e.requestId } });
      sink.send('[DONE]');
      sink.end();
    }
    return;
  }
  const result = await runChatCompletion(ctx, req.body);
  res.setHeader('x-nexovra-request-id', result!.requestId);
  res.setHeader('x-nexovra-cost-usd', result!.meta.cost_usd.toFixed(6));
  res.json(result!.body);
});

v1Router.get('/balance', async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.apiKeyAuth!.orgId }, select: { balanceMicros: true, heldMicros: true } });
  const key = req.apiKeyAuth!;
  res.json({
    balance_usd: microsToUsd(org.balanceMicros),
    held_usd: microsToUsd(org.heldMicros),
    key: { spent_usd: microsToUsd(key.spentMicros), spend_limit_usd: key.spendLimitMicros !== null ? microsToUsd(key.spendLimitMicros) : null },
  });
});

/** Usage for the calling API key only (least privilege). */
v1Router.get('/usage', async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.usageRecord.findMany({ where: { apiKeyId: req.apiKeyAuth!.id, day: { gte: since } }, orderBy: { day: 'asc' } });
  const byModel = new Map<string, { requests: number; failures: number; input_tokens: number; output_tokens: number; cost_usd: number; baseline_cost_usd: number }>();
  for (const r of rows) {
    const m = byModel.get(r.modelId) ?? { requests: 0, failures: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, baseline_cost_usd: 0 };
    m.requests += r.requests;
    m.failures += r.failures;
    m.input_tokens += Number(r.inputTokens);
    m.output_tokens += Number(r.outputTokens);
    m.cost_usd += microsToUsd(r.costMicros);
    m.baseline_cost_usd += microsToUsd(r.baselineCostMicros);
    byModel.set(r.modelId, m);
  }
  res.json({
    object: 'usage',
    days,
    data: rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), model: r.modelId, requests: r.requests, failures: r.failures, input_tokens: Number(r.inputTokens), output_tokens: Number(r.outputTokens), cost_usd: microsToUsd(r.costMicros) })),
    by_model: [...byModel.entries()].map(([model, v]) => ({ model, ...v })),
  });
});

v1Router.get('/requests/:id', async (req, res) => {
  const r = await prisma.inferenceRequest.findFirst({
    where: { id: String(req.params.id), apiKeyId: req.apiKeyAuth!.id },
    include: { attempts: { orderBy: { attempt: 'asc' } }, offer: { select: { sellerOrg: { select: { name: true } } } } },
  });
  if (!r) throw notFound('Request not found', 'request_not_found');
  // snake_case like the rest of /v1 (the dashboard serializer is camelCase).
  const snake = Object.fromEntries(Object.entries(serializeRequest(r)).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]));
  res.json({
    request: snake,
    trace: r.routingTrace,
    attempts: r.attempts.map((a) => ({ attempt: a.attempt, offer_id: a.offerId, ok: a.ok, latency_ms: a.latencyMs, status_code: a.statusCode, error_code: a.errorCode, error: a.error })),
  });
});
