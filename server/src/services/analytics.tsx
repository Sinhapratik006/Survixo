import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { cached } from '../lib/store.js';
import { blendedPrice } from './catalog.js';

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayRange(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))));
  return out;
}

const LATENCY_BUCKETS: Array<[string, number, number]> = [
  ['<250ms', 0, 250],
  ['250–500ms', 250, 500],
  ['0.5–1s', 500, 1000],
  ['1–2s', 1000, 2000],
  ['2–5s', 2000, 5000],
  ['>5s', 5000, Number.MAX_SAFE_INTEGER],
];

/**
 * Public marketplace analytics computed from recorded data only. When demo
 * offers/traffic are present the response reports their share so the UI can
 * label charts accordingly.
 */
export async function getAnalyticsOverview(days: number) {
  return cached(`analytics:overview:${days}`, 60, async () => {
    const since = new Date(Date.now() - days * 86_400_000);
    const range = dayRange(days);

    const [models, offers, daily, savings, latency, history, buyers] = await Promise.all([
      prisma.model.count(),
      prisma.offer.findMany({
        where: { status: 'ACTIVE', validatedAt: { not: null }, endpoint: { status: 'VERIFIED' }, ...(env.DEMO_MODE ? {} : { isDemo: false }) },
        select: { id: true, modelId: true, sellerOrgId: true, healthStatus: true, isDemo: true, model: { select: { name: true } } },
      }),
      prisma.$queryRaw<Array<{ day: Date; ok: bigint; failed: bigint; rejected: bigint; demo: bigint; tokens: bigint | null }>>`
        SELECT date_trunc('day', "createdAt") AS day,
          COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS ok,
          COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed,
          COUNT(*) FILTER (WHERE status = 'REJECTED')::bigint AS rejected,
          COUNT(*) FILTER (WHERE "isDemo")::bigint AS demo,
          SUM("inputTokens" + "outputTokens")::bigint AS tokens
        FROM "InferenceRequest" WHERE "createdAt" >= ${since} GROUP BY 1`,
      prisma.$queryRaw<Array<{ day: Date; realized: number | null; estimated: number | null }>>`
        SELECT date_trunc('day', "createdAt") AS day,
          SUM(("baselineCostMicros" - "costMicros")::float / 1e6) FILTER (WHERE "baselineCostMicros" IS NOT NULL) AS realized,
          SUM(COALESCE(("routingTrace"->'ranked'->0->>'baseline_est_usd')::float, 0) - COALESCE(("routingTrace"->'ranked'->0->>'est_cost_usd')::float, 0))
            FILTER (WHERE "routingTrace"->'ranked'->0->>'baseline_est_usd' IS NOT NULL) AS estimated
        FROM "InferenceRequest" WHERE "createdAt" >= ${since} AND status = 'SUCCESS' GROUP BY 1`,
      prisma.$queryRaw<Array<{ bucket: number; n: bigint }>>`
        SELECT width_bucket("latencyMs", ARRAY[250, 500, 1000, 2000, 5000]) AS bucket, COUNT(*)::bigint AS n
        FROM "RequestAttempt" WHERE ok AND "createdAt" >= ${since} GROUP BY 1`,
      prisma.offerPriceHistory.findMany({ where: { recordedAt: { lte: new Date() } }, orderBy: { recordedAt: 'asc' } }),
      prisma.$queryRaw<Array<{ day: Date; buyers: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(DISTINCT "orgId")::bigint AS buyers
        FROM "InferenceRequest" WHERE "createdAt" >= ${since} GROUP BY 1`,
    ]);

    const dailyMap = new Map(daily.map((r) => [dayKey(r.day), r]));
    const savingsMap = new Map(savings.map((r) => [dayKey(r.day), r]));
    const buyersMap = new Map(buyers.map((r) => [dayKey(r.day), Number(r.buyers)]));
    const totalRequests = daily.reduce((s, r) => s + Number(r.ok + r.failed + r.rejected), 0);
    const demoRequests = daily.reduce((s, r) => s + Number(r.demo), 0);

    // Price movements: daily minimum blended price per model across its active offers (carry-forward of the latest price).
    const activeIds = new Set(offers.map((o) => o.id));
    const offerCountByModel = new Map<string, { name: string; count: number; healthy: number }>();
    for (const o of offers) {
      const e = offerCountByModel.get(o.modelId) ?? { name: o.model.name, count: 0, healthy: 0 };
      e.count++;
      if (o.healthStatus !== 'UNHEALTHY') e.healthy++;
      offerCountByModel.set(o.modelId, e);
    }
    const topModels = [...offerCountByModel.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const priceSeries = range.map((day) => {
      const end = new Date(`${day}T23:59:59.999Z`);
      const row: Record<string, string | number | null> = { day };
      for (const [modelId] of topModels) {
        const latest = new Map<string, number>();
        for (const h of history) {
          if (h.modelId !== modelId || h.recordedAt > end || !activeIds.has(h.offerId)) continue;
          latest.set(h.offerId, blendedPrice(h.inputPrice, h.outputPrice) / 1e6);
        }
        row[modelId] = latest.size ? Number(Math.min(...latest.values()).toFixed(4)) : null;
      }
      return row;
    });

    const latencyCounts = new Map(latency.map((r) => [Number(r.bucket), Number(r.n)]));

    return {
      windowDays: days,
      generatedAt: new Date().toISOString(),
      totals: {
        modelsListed: models,
        modelsWithOffers: offerCountByModel.size,
        activeOffers: offers.length,
        healthyOffers: offers.filter((o) => o.healthStatus !== 'UNHEALTHY').length,
        sellers: new Set(offers.map((o) => o.sellerOrgId)).size,
        requests: totalRequests,
      },
      demo: {
        requestShare: totalRequests ? demoRequests / totalRequests : 0,
        offerShare: offers.length ? offers.filter((o) => o.isDemo).length / offers.length : 0,
      },
      priceMovements: { models: topModels.map(([id, v]) => ({ id, name: v.name })), series: priceSeries, unit: 'USD per 1M tokens (blended 3:1)' },
      offersByModel: [...offerCountByModel.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 12)
        .map(([id, v]) => ({ modelId: id, name: v.name, offers: v.count, healthy: v.healthy })),
      requestVolume: range.map((day) => {
        const r = dailyMap.get(day);
        return { day, success: Number(r?.ok ?? 0), failed: Number(r?.failed ?? 0), rejected: Number(r?.rejected ?? 0) };
      }),
      savings: range.map((day) => {
        const r = savingsMap.get(day);
        return { day, estimatedUsd: Number((r?.estimated ?? 0).toFixed(6)), realizedUsd: Number((r?.realized ?? 0).toFixed(6)) };
      }),
      latencyDistribution: LATENCY_BUCKETS.map(([label], i) => ({ bucket: label, count: latencyCounts.get(i) ?? 0 })),
      activity: range.map((day) => ({ day, tokens: Number(dailyMap.get(day)?.tokens ?? 0), activeBuyers: buyersMap.get(day) ?? 0 })),
      definitions: {
        estimatedSavings: 'Pre-request estimate for the first-choice offer: baseline estimate minus offer estimate, using the prompt-token estimate and max_tokens.',
        realizedSavings: 'Baseline reference price for the tokens actually used minus the amount actually charged.',
        baseline: 'Baseline prices are catalog reference prices. In demo mode they are illustrative, not quotes from a provider.',
      },
    };
  });
}
