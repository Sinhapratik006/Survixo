import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { store } from '../lib/store.js';
import { notFound } from '../lib/errors.js';
import { microsToUsd, pricePerMToUsd } from '../lib/money.js';
import { parse } from '../middleware/error.js';
import { blendedPrice, getCatalog, type CatalogModel } from '../services/catalog.js';
import { getOfferMetrics } from '../services/stats.js';
import { availableAdapters } from '../providers/registry.js';
import { RELIABILITY_MIN_SAMPLES, RELIABILITY_WINDOW_DAYS } from '../services/reliability.js';
import { getAnalyticsOverview } from '../services/analytics.js';

export const publicRouter = Router();

publicRouter.get('/config/public', (_req, res) => {
  res.json({
    demoMode: env.DEMO_MODE,
    billingMode: env.BILLING_MODE,
    platformFeeBps: env.PLATFORM_FEE_BPS,
    googleAuthEnabled: env.googleEnabled,
    apiBaseUrl: `${env.apiPublicUrl.replace(/\/$/, '')}/v1`,
    adapters: availableAdapters(),
    reliability: { minSamples: RELIABILITY_MIN_SAMPLES, windowDays: RELIABILITY_WINDOW_DAYS },
  });
});

const listQuery = z.object({
  search: z.string().max(100).optional(),
  capability: z.string().max(200).optional(),
  provider: z.string().max(500).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minContext: z.coerce.number().int().min(0).optional(),
  available: z.enum(['true', 'false']).optional(),
  sort: z.enum(['price', 'latency', 'popularity', 'quality', 'context', 'name', 'discount']).default('popularity'),
});

function sortModels(models: CatalogModel[], sort: z.infer<typeof listQuery>['sort']) {
  const price = (m: CatalogModel) => (m.bestOffer ? blendedPrice(m.bestOffer.inputPerM, m.bestOffer.outputPerM) : Number.POSITIVE_INFINITY);
  const nullsLast = (v: number | null, dir: 1 | -1) => (v === null ? Number.POSITIVE_INFINITY : dir * v);
  const cmp: Record<typeof sort, (a: CatalogModel, b: CatalogModel) => number> = {
    price: (a, b) => price(a) - price(b),
    latency: (a, b) => nullsLast(a.p50LatencyMs, 1) - nullsLast(b.p50LatencyMs, 1),
    popularity: (a, b) => b.requests7d - a.requests7d || b.offerCount - a.offerCount,
    quality: (a, b) => nullsLast(a.qualityScore, -1) - nullsLast(b.qualityScore, -1),
    context: (a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0),
    discount: (a, b) => nullsLast(a.bestOffer?.discountPct ?? null, -1) - nullsLast(b.bestOffer?.discountPct ?? null, -1),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...models].sort((a, b) => cmp[sort](a, b) || a.name.localeCompare(b.name));
}

publicRouter.get('/models', async (req, res) => {
  const q = parse(listQuery, req.query);
  const caps = q.capability?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const providers = q.provider?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) ?? [];
  const term = q.search?.trim().toLowerCase();
  const catalog = await getCatalog();
  const filtered = catalog.filter((m) => {
    if (term && !`${m.name} ${m.id} ${m.provider.name} ${m.aliases.join(' ')}`.toLowerCase().includes(term)) return false;
    if (caps.length) {
      const modelCaps = new Set([...m.capabilities.map((c) => c.capability), ...m.outputModalities.map((o) => `output:${o}`), ...m.inputModalities.map((i) => `input:${i}`)]);
      if (!caps.every((c) => modelCaps.has(c))) return false;
    }
    if (providers.length && !providers.includes(m.provider.id.toLowerCase())) return false;
    if (q.maxPrice !== undefined && (!m.bestOffer || m.bestOffer.outputPerM > q.maxPrice)) return false;
    if (q.minContext !== undefined && (m.contextWindow ?? 0) < q.minContext) return false;
    if (q.available === 'true' && !m.healthyOfferCount) return false;
    return true;
  });
  res.json({
    data: sortModels(filtered, q.sort),
    total: catalog.length,
    generatedAt: new Date().toISOString(),
    notes: {
      blendedPrice: 'Comparisons use a blended price assuming 3 input tokens per output token.',
      demo: env.DEMO_MODE ? 'Demo mode: catalog baseline prices and demo offers are illustrative, not live market data.' : null,
    },
  });
});

publicRouter.get('/providers', async (_req, res) => {
  const providers = await prisma.provider.findMany({ include: { _count: { select: { models: true } } }, orderBy: { name: 'asc' } });
  res.json({ data: providers.map((p) => ({ id: p.id, name: p.name, website: p.website, dataPolicyUrl: p.dataPolicyUrl, modelCount: p._count.models })) });
});

publicRouter.get('/models/:id', async (req, res) => {
  const catalog = await getCatalog();
  const model = catalog.find((m) => m.id === String(req.params.id) || m.aliases.includes(String(req.params.id).toLowerCase()));
  if (!model) throw notFound('Model not found', 'model_not_found');

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [offers, benchmarks, history] = await Promise.all([
    prisma.offer.findMany({
      where: { modelId: model.id, status: 'ACTIVE', validatedAt: { not: null }, endpoint: { status: 'VERIFIED' }, ...(env.DEMO_MODE ? {} : { isDemo: false }) },
      include: { sellerOrg: { select: { id: true, name: true, slug: true } }, endpoint: { select: { adapter: true, status: true } } },
    }),
    prisma.benchmarkResult.findMany({ where: { modelId: model.id, isPublic: true }, orderBy: { runAt: 'desc' }, take: 20 }),
    prisma.offerPriceHistory.findMany({ where: { modelId: model.id, recordedAt: { gte: since } }, orderBy: { recordedAt: 'asc' } }),
  ]);
  const metrics = await getOfferMetrics(offers.map((o) => o.id));

  res.json({
    model,
    offers: offers
      .map((o) => {
        const m = metrics.get(o.id);
        return {
          id: o.id,
          seller: o.sellerOrg,
          adapter: o.endpoint.adapter,
          endpointStatus: o.endpoint.status,
          inputPerM: pricePerMToUsd(o.inputPrice),
          outputPerM: pricePerMToUsd(o.outputPrice),
          healthStatus: o.healthStatus,
          verifiedCapabilities: o.verifiedCapabilities,
          maxConcurrency: o.maxConcurrency,
          rpmLimit: o.rpmLimit,
          isDemo: o.isDemo,
          validatedAt: o.validatedAt,
          stats: m?.stats ?? null,
          reliability: m?.reliability ?? null,
        };
      })
      .sort((a, b) => blendedPrice(a.inputPerM!, a.outputPerM!) - blendedPrice(b.inputPerM!, b.outputPerM!)),
    benchmarks: benchmarks.map((b) => ({ ...b, costUsd: microsToUsd(b.costMicros), costMicros: undefined })),
    priceHistory: history.map((h) => ({ offerId: h.offerId, at: h.recordedAt, inputPerM: pricePerMToUsd(h.inputPrice), outputPerM: pricePerMToUsd(h.outputPrice) })),
  });
});

publicRouter.get('/benchmarks', async (req, res) => {
  const modelIds = typeof req.query.models === 'string' ? req.query.models.split(',').slice(0, 20) : undefined;
  const results = await prisma.benchmarkResult.findMany({
    where: { isPublic: true, ...(modelIds ? { modelId: { in: modelIds } } : {}) },
    include: { model: { select: { name: true } } },
    orderBy: { runAt: 'desc' },
    take: 200,
  });
  res.json({ data: results.map((b) => ({ ...b, modelName: b.model.name, model: undefined, costUsd: microsToUsd(b.costMicros), costMicros: undefined })) });
});

publicRouter.get('/analytics/overview', async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  res.json(await getAnalyticsOverview(days));
});

publicRouter.get('/status', async (_req, res) => {
  const checks = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    store.ping(),
  ]);
  const [heartbeats, incidents, offerCounts, uptimeRows] = await Promise.all([
    prisma.workerHeartbeat.findMany(),
    prisma.incident.findMany({
      where: { OR: [{ resolvedAt: null }, { resolvedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }] },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.offer.groupBy({ by: ['healthStatus'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ day: Date; total: bigint; ok: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE ok)::bigint AS ok
      FROM "RequestAttempt" WHERE "createdAt" >= now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
  ]);
  const count = (s: string) => offerCounts.find((o) => o.healthStatus === s)?._count._all ?? 0;
  const workerStale = (name: string, maxAgeMs: number) => {
    const hb = heartbeats.find((h) => h.name === name);
    if (!hb) return { status: 'unknown', detail: 'No heartbeat recorded yet' };
    const stale = Date.now() - hb.lastRunAt.getTime() > maxAgeMs;
    return { status: stale ? 'degraded' : hb.lastError ? 'degraded' : 'operational', detail: hb.lastError ?? `Last run ${hb.lastRunAt.toISOString()}` };
  };
  const components = [
    { name: 'API', status: 'operational', detail: 'Responding' },
    { name: 'Database', status: checks[0] ? 'operational' : 'outage', detail: checks[0] ? 'Connected' : 'Unreachable' },
    {
      name: 'Cache & rate limiting',
      status: checks[1] ? 'operational' : 'degraded',
      detail: store.kind === 'redis' ? (checks[1] ? 'Redis connected' : 'Redis unreachable') : 'In-memory store (development mode)',
    },
    { name: 'Health-check worker', ...workerStale('health-checker', 10 * 60_000) },
    { name: 'Webhook delivery', ...workerStale('webhook-delivery', 2 * 60_000) },
    {
      name: 'Marketplace offers',
      status: count('HEALTHY') + count('UNKNOWN') > 0 ? (count('UNHEALTHY') > 0 ? 'degraded' : 'operational') : 'unknown',
      detail: `${count('HEALTHY')} healthy, ${count('UNHEALTHY')} unhealthy, ${count('UNKNOWN')} not yet measured`,
    },
  ];
  const overall = components.some((c) => c.status === 'outage') ? 'outage' : components.some((c) => c.status === 'degraded') ? 'degraded' : 'operational';
  res.json({
    status: overall,
    components,
    incidents,
    uptime: uptimeRows.map((r) => ({ day: r.day, attempts: Number(r.total), successRate: Number(r.total) ? Number(r.ok) / Number(r.total) : null })),
    generatedAt: new Date().toISOString(),
    demoMode: env.DEMO_MODE,
  });
});
