import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type InferenceRequest } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { microsToUsd, nullableMicrosToUsd } from '../lib/money.js';
import { parse } from '../middleware/error.js';
import { requireOrg, requirePermission } from '../middleware/org.js';
import { rateLimit, userKey } from '../middleware/rateLimit.js';
import { runChatCompletion } from '../services/inference.js';
import { budgetStatus } from '../services/budget.js';

export const usageRouter = Router();
usageRouter.use(requireOrg());

export function serializeRequest(r: InferenceRequest & { apiKey?: { name: string } | null; offer?: { sellerOrg: { name: string } } | null }) {
  return {
    id: r.id,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    requestedModel: r.requestedModel,
    modelId: r.modelId,
    offerId: r.offerId,
    seller: r.offer?.sellerOrg.name ?? null,
    apiKeyId: r.apiKeyId,
    apiKeyName: r.apiKey?.name ?? null,
    source: r.source,
    status: r.status,
    stream: r.stream,
    routingMode: r.routingMode,
    httpStatus: r.httpStatus,
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    usageEstimated: r.usageEstimated,
    costUsd: microsToUsd(r.costMicros),
    baselineCostUsd: nullableMicrosToUsd(r.baselineCostMicros),
    holdUsd: microsToUsd(r.holdMicros),
    latencyMs: r.latencyMs,
    ttftMs: r.ttftMs,
    retryCount: r.retryCount,
    taskId: r.taskId,
    isDemo: r.isDemo,
  };
}

const summaryQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  apiKeyId: z.string().max(40).optional(),
  modelId: z.string().max(200).optional(),
});

usageRouter.get('/summary', requirePermission('usage:view'), async (req, res) => {
  const q = parse(summaryQuery, req.query);
  const orgId = req.org!.id;
  const since = new Date(Date.now() - q.days * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const where: Prisma.UsageRecordWhereInput = {
    orgId,
    day: { gte: since },
    ...(q.apiKeyId ? { apiKeyId: q.apiKeyId } : {}),
    ...(q.modelId ? { modelId: q.modelId } : {}),
  };
  const [rows, keys, latency] = await Promise.all([
    prisma.usageRecord.findMany({ where, orderBy: { day: 'asc' } }),
    prisma.apiKey.findMany({ where: { orgId }, select: { id: true, name: true } }),
    prisma.$queryRaw<Array<{ p50: number | null; p95: number | null; p99: number | null }>>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs")::float AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95,
             percentile_cont(0.99) WITHIN GROUP (ORDER BY "latencyMs")::float AS p99
      FROM "InferenceRequest" WHERE "orgId" = ${orgId} AND status = 'SUCCESS' AND "createdAt" >= ${since}
      ${q.apiKeyId ? prismaSqlKey(q.apiKeyId) : emptySql()} ${q.modelId ? prismaSqlModel(q.modelId) : emptySql()}`,
  ]);
  const keyNames = new Map(keys.map((k) => [k.id, k.name]));

  const days: string[] = [];
  for (let d = new Date(since); d <= new Date(); d = new Date(d.getTime() + 86_400_000)) days.push(d.toISOString().slice(0, 10));
  const byDay = new Map<string, { costUsd: number; baselineUsd: number; requests: number; failures: number; inputTokens: number; outputTokens: number }>();
  const byModel = new Map<string, { costUsd: number; requests: number; failures: number; tokens: number; baselineUsd: number }>();
  const byKey = new Map<string, { costUsd: number; requests: number; failures: number; tokens: number }>();
  for (const r of rows) {
    const day = r.day.toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { costUsd: 0, baselineUsd: 0, requests: 0, failures: 0, inputTokens: 0, outputTokens: 0 };
    d.costUsd += microsToUsd(r.costMicros);
    d.baselineUsd += microsToUsd(r.baselineCostMicros);
    d.requests += r.requests;
    d.failures += r.failures;
    d.inputTokens += Number(r.inputTokens);
    d.outputTokens += Number(r.outputTokens);
    byDay.set(day, d);
    const m = byModel.get(r.modelId) ?? { costUsd: 0, requests: 0, failures: 0, tokens: 0, baselineUsd: 0 };
    m.costUsd += microsToUsd(r.costMicros);
    m.baselineUsd += microsToUsd(r.baselineCostMicros);
    m.requests += r.requests;
    m.failures += r.failures;
    m.tokens += Number(r.inputTokens + r.outputTokens);
    byModel.set(r.modelId, m);
    const k = byKey.get(r.keyScope) ?? { costUsd: 0, requests: 0, failures: 0, tokens: 0 };
    k.costUsd += microsToUsd(r.costMicros);
    k.requests += r.requests;
    k.failures += r.failures;
    k.tokens += Number(r.inputTokens + r.outputTokens);
    byKey.set(r.keyScope, k);
  }
  const series = days.map((day) => ({ day, ...(byDay.get(day) ?? { costUsd: 0, baselineUsd: 0, requests: 0, failures: 0, inputTokens: 0, outputTokens: 0 }) }));
  const totals = series.reduce(
    (t, d) => ({
      costUsd: t.costUsd + d.costUsd,
      baselineUsd: t.baselineUsd + d.baselineUsd,
      requests: t.requests + d.requests,
      failures: t.failures + d.failures,
      inputTokens: t.inputTokens + d.inputTokens,
      outputTokens: t.outputTokens + d.outputTokens,
    }),
    { costUsd: 0, baselineUsd: 0, requests: 0, failures: 0, inputTokens: 0, outputTokens: 0 },
  );
  const l = latency[0];
  res.json({
    days: q.days,
    totals: { ...totals, errorRate: totals.requests ? totals.failures / totals.requests : null },
    latency: { p50: l?.p50 != null ? Math.round(l.p50) : null, p95: l?.p95 != null ? Math.round(l.p95) : null, p99: l?.p99 != null ? Math.round(l.p99) : null },
    series,
    byModel: [...byModel.entries()].map(([modelId, v]) => ({ modelId, ...v })).sort((a, b) => b.costUsd - a.costUsd),
    byKey: [...byKey.entries()]
      .map(([scope, v]) => ({ apiKeyId: scope === 'dashboard' ? null : scope, name: scope === 'dashboard' ? 'Dashboard (playground/arena)' : (keyNames.get(scope) ?? 'Deleted key'), ...v }))
      .sort((a, b) => b.costUsd - a.costUsd),
  });
});

function prismaSqlKey(id: string) {
  return Prisma.sql`AND "apiKeyId" = ${id}`;
}
function prismaSqlModel(id: string) {
  return Prisma.sql`AND "modelId" = ${id}`;
}
function emptySql() {
  return Prisma.empty;
}

const listQuery = z.object({
  status: z.enum(['SUCCESS', 'FAILED', 'REJECTED', 'IN_PROGRESS']).optional(),
  modelId: z.string().max(200).optional(),
  apiKeyId: z.string().max(40).optional(),
  source: z.enum(['API', 'PLAYGROUND', 'ARENA', 'BENCHMARK', 'SEED']).optional(),
  cursor: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

usageRouter.get('/requests', requirePermission('usage:view'), async (req, res) => {
  const q = parse(listQuery, req.query);
  const rows = await prisma.inferenceRequest.findMany({
    where: {
      orgId: req.org!.id,
      ...(q.status && { status: q.status }),
      ...(q.modelId && { modelId: q.modelId }),
      ...(q.apiKeyId && { apiKeyId: q.apiKeyId }),
      ...(q.source && { source: q.source }),
    },
    include: { apiKey: { select: { name: true } }, offer: { select: { sellerOrg: { select: { name: true } } } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  res.json({ data: page.map(serializeRequest), nextCursor: hasMore ? page[page.length - 1]!.id : null });
});

usageRouter.get('/requests/:id', requirePermission('usage:view'), async (req, res) => {
  const r = await prisma.inferenceRequest.findFirst({
    where: { id: String(req.params.id), orgId: req.org!.id },
    include: {
      apiKey: { select: { name: true } },
      offer: { select: { sellerOrg: { select: { name: true } } } },
      attempts: { orderBy: { attempt: 'asc' }, include: { offer: { select: { sellerOrg: { select: { name: true } }, modelId: true } } } },
    },
  });
  if (!r) throw notFound('Request not found');
  const payloadAvailable = Boolean(r.payload && r.payloadExpiresAt && r.payloadExpiresAt > new Date());
  res.json({
    request: serializeRequest(r),
    trace: r.routingTrace,
    attempts: r.attempts.map((a) => ({
      attempt: a.attempt,
      offerId: a.offerId,
      seller: a.offer.sellerOrg.name,
      modelId: a.offer.modelId,
      ok: a.ok,
      latencyMs: a.latencyMs,
      statusCode: a.statusCode,
      errorCode: a.errorCode,
      error: a.error,
      at: a.createdAt,
    })),
    payload: payloadAvailable ? r.payload : null,
    payloadNotice: payloadAvailable
      ? 'Prompt stored under your organization retention policy, with secrets redacted.'
      : 'Prompt content is not stored (default). Provide messages to replay this request.',
  });
});

const replaySchema = z.object({
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().max(200_000) })).min(1).max(100).optional(),
  maxTokens: z.number().int().positive().max(8192).optional(),
});

usageRouter.post(
  '/requests/:id/replay',
  requirePermission('inference:use'),
  rateLimit({ name: 'replay', windowSeconds: 60, max: 20, key: userKey }),
  async (req, res) => {
    const body = parse(replaySchema, req.body);
    const original = await prisma.inferenceRequest.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
    if (!original) throw notFound('Request not found');
    const stored = original.payload && original.payloadExpiresAt && original.payloadExpiresAt > new Date() ? (original.payload as { messages?: unknown; params?: { max_tokens?: number } }) : null;
    const messages = body.messages ?? stored?.messages;
    if (!messages) throw badRequest('The original prompt was not retained. Provide messages to replay.', undefined, 'payload_not_retained');
    const result = await runChatCompletion(
      { orgId: req.org!.id, userId: req.auth!.user.id, source: 'PLAYGROUND', projectId: original.projectId },
      {
        model: original.requestedModel,
        messages,
        max_tokens: body.maxTokens ?? stored?.params?.max_tokens ?? 512,
        ...(original.routingMode ? { nexovra: { routing_mode: original.routingMode } } : {}),
      },
    );
    res.json({ replayOf: original.id, result: result!.body });
  },
);

usageRouter.get('/export.csv', requirePermission('usage:view'), async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const rows = await prisma.inferenceRequest.findMany({
    where: { orgId: req.org!.id, createdAt: { gte: new Date(Date.now() - days * 86_400_000) } },
    include: { apiKey: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50_000,
  });
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Neutralize spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ['request_id', 'created_at', 'status', 'model', 'api_key', 'source', 'input_tokens', 'output_tokens', 'cost_usd', 'baseline_cost_usd', 'latency_ms', 'retries', 'error_code'];
  const lines = rows.map((r) =>
    [r.id, r.createdAt.toISOString(), r.status, r.modelId ?? r.requestedModel, r.apiKey?.name ?? '', r.source, r.inputTokens, r.outputTokens, microsToUsd(r.costMicros).toFixed(6), r.baselineCostMicros !== null ? microsToUsd(r.baselineCostMicros).toFixed(6) : '', r.latencyMs ?? '', r.retryCount, r.errorCode ?? '']
      .map(esc)
      .join(','),
  );
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="nexovra-usage-${days}d.csv"`);
  res.send([header.join(','), ...lines].join('\n'));
});

export const dashboardRouter = Router();
dashboardRouter.use(requireOrg());

dashboardRouter.get('/summary', requirePermission('usage:view'), async (req, res) => {
  const orgId = req.org!.id;
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [org, budget, agg, latency, topModels, recent, providerStatus] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { balanceMicros: true, heldMicros: true, sellerBalanceMicros: true, name: true } }),
    budgetStatus(orgId),
    prisma.usageRecord.aggregate({
      where: { orgId, day: { gte: since30 } },
      _sum: { requests: true, failures: true, costMicros: true, baselineCostMicros: true, inputTokens: true, outputTokens: true },
    }),
    prisma.$queryRaw<Array<{ p50: number | null; p95: number | null }>>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs")::float AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95
      FROM "InferenceRequest" WHERE "orgId" = ${orgId} AND status = 'SUCCESS' AND "createdAt" >= ${since30}`,
    prisma.usageRecord.groupBy({
      by: ['modelId'],
      where: { orgId, day: { gte: since30 } },
      _sum: { costMicros: true, requests: true },
      orderBy: { _sum: { costMicros: 'desc' } },
      take: 5,
    }),
    prisma.inferenceRequest.findMany({
      where: { orgId },
      include: { apiKey: { select: { name: true } }, offer: { select: { sellerOrg: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.$queryRaw<Array<{ modelId: string; healthy: bigint; unhealthy: bigint; total: bigint }>>`
      SELECT o."modelId", COUNT(*) FILTER (WHERE o."healthStatus" <> 'UNHEALTHY')::bigint AS healthy,
        COUNT(*) FILTER (WHERE o."healthStatus" = 'UNHEALTHY')::bigint AS unhealthy, COUNT(*)::bigint AS total
      FROM "Offer" o WHERE o.status = 'ACTIVE' AND o."modelId" IN (
        SELECT DISTINCT "modelId" FROM "UsageRecord" WHERE "orgId" = ${orgId} AND day >= ${since30})
      GROUP BY o."modelId"`,
  ]);
  const requests = agg._sum.requests ?? 0;
  const failures = agg._sum.failures ?? 0;
  const b = budget.budget;
  res.json({
    balanceUsd: microsToUsd(org?.balanceMicros),
    heldUsd: microsToUsd(org?.heldMicros),
    sellerBalanceUsd: microsToUsd(org?.sellerBalanceMicros),
    todaySpendUsd: microsToUsd(budget.daySpentMicros),
    monthSpendUsd: microsToUsd(budget.monthSpentMicros),
    inFlightUsd: microsToUsd(budget.inFlightMicros),
    last30d: {
      requests,
      failures,
      errorRate: requests ? failures / requests : null,
      costUsd: microsToUsd(agg._sum.costMicros),
      baselineUsd: microsToUsd(agg._sum.baselineCostMicros),
      estimatedSavingsUsd: microsToUsd((agg._sum.baselineCostMicros ?? 0n) - (agg._sum.costMicros ?? 0n)),
      tokens: Number((agg._sum.inputTokens ?? 0n) + (agg._sum.outputTokens ?? 0n)),
      p50LatencyMs: latency[0]?.p50 != null ? Math.round(latency[0].p50) : null,
      p95LatencyMs: latency[0]?.p95 != null ? Math.round(latency[0].p95) : null,
    },
    budget: b
      ? {
          dailyLimitUsd: nullableMicrosToUsd(b.dailyLimitMicros),
          monthlyLimitUsd: nullableMicrosToUsd(b.monthlyLimitMicros),
          dailyRemainingUsd: b.dailyLimitMicros !== null ? microsToUsd(b.dailyLimitMicros - budget.daySpentMicros) : null,
          monthlyRemainingUsd: b.monthlyLimitMicros !== null ? microsToUsd(b.monthlyLimitMicros - budget.monthSpentMicros) : null,
          hardLimit: b.hardLimit,
        }
      : null,
    topModels: topModels.map((t) => ({ modelId: t.modelId, costUsd: microsToUsd(t._sum.costMicros), requests: t._sum.requests ?? 0 })),
    recentRequests: recent.map(serializeRequest),
    providerStatus: providerStatus.map((p) => ({ modelId: p.modelId, healthy: Number(p.healthy), unhealthy: Number(p.unhealthy), total: Number(p.total) })),
  });
});
