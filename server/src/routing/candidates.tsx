import { prisma } from '../lib/prisma.js';
import { store } from '../lib/store.js';
import { getAdapter } from '../providers/registry.js';
import { env } from '../config/env.js';
import { getOfferMetrics, getQualityScores } from '../services/stats.js';
import type { Candidate } from './engine.js';

export const inflightKey = (offerId: string) => `offer:inflight:${offerId}`;
export const rpmKey = (offerId: string, minute = Math.floor(Date.now() / 60_000)) => `offer:rpm:${offerId}:${minute}`;

/** Load routing candidates (offers + measured stats) for the given models. */
export async function loadCandidates(modelIds: string[]): Promise<Candidate[]> {
  if (!modelIds.length) return [];
  const offers = await prisma.offer.findMany({
    where: { modelId: { in: modelIds }, status: { not: 'ARCHIVED' }, ...(env.DEMO_MODE ? {} : { isDemo: false }) },
    include: {
      endpoint: { select: { id: true, status: true, adapter: true } },
      sellerOrg: { select: { id: true, name: true, slug: true } },
      model: { include: { capabilities: { select: { capability: true } } } },
    },
  });
  const [metrics, quality] = await Promise.all([
    getOfferMetrics(offers.map((o) => o.id)),
    getQualityScores([...new Set(offers.map((o) => o.modelId))]),
  ]);
  const counters = await Promise.all(
    offers.map(async (o) => {
      const [inflight, rpm] = await Promise.all([store.get(inflightKey(o.id)), store.get(rpmKey(o.id))]);
      return { inflight: Number(inflight ?? 0), rpm: Number(rpm ?? 0) };
    }),
  );

  return offers.flatMap((o, i) => {
    let features;
    try {
      features = getAdapter(o.endpoint.adapter).features;
    } catch {
      return [];
    }
    const m = metrics.get(o.id);
    return [
      {
        offerId: o.id,
        modelId: o.modelId,
        modelName: o.model.name,
        providerId: o.model.providerId,
        sellerOrgId: o.sellerOrg.id,
        sellerName: o.sellerOrg.name,
        sellerSlug: o.sellerOrg.slug,
        endpointId: o.endpointId,
        adapter: o.endpoint.adapter,
        adapterFeatures: features,
        upstreamModel: o.upstreamModel,
        inputPrice: o.inputPrice,
        outputPrice: o.outputPrice,
        baselineInputPrice: o.model.baselineInputPrice,
        baselineOutputPrice: o.model.baselineOutputPrice,
        status: o.status,
        endpointStatus: o.endpoint.status,
        validated: o.validatedAt !== null,
        healthStatus: o.healthStatus,
        verifiedCapabilities: o.verifiedCapabilities,
        modelCapabilities: o.model.capabilities.map((c) => c.capability),
        inputModalities: o.model.inputModalities,
        contextWindow: o.model.contextWindow,
        maxOutputTokens: o.model.maxOutputTokens,
        timeoutMs: o.timeoutMs,
        isDemo: o.isDemo,
        stats: m?.stats ?? { samples: 0, successRate: null, p50LatencyMs: null, p95LatencyMs: null },
        reliabilityScore: m?.reliability.score ?? null,
        qualityScore: quality.get(o.modelId) ?? null,
        inFlight: counters[i]!.inflight,
        maxConcurrency: o.maxConcurrency,
        rpmUsed: counters[i]!.rpm,
        rpmLimit: o.rpmLimit,
        dailySpendCapMicros: o.dailySpendCapMicros,
        dailySoldMicros: m?.dailySoldMicros ?? 0n,
      } satisfies Candidate,
    ];
  });
}
