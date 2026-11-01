import { prisma } from '../lib/prisma.js';
import { cached } from '../lib/store.js';
import { pricePerMToUsd } from '../lib/money.js';
import { env } from '../config/env.js';
import { getOfferMetrics, getQualityScores } from './stats.js';

/** Blended price assumption used for list comparisons: 3 input tokens per output token. */
export const BLEND_INPUT_SHARE = 0.75;

export function blendedPrice(input: number, output: number): number {
  return input * BLEND_INPUT_SHARE + output * (1 - BLEND_INPUT_SHARE);
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: { id: string; name: string };
  description: string | null;
  family: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputModalities: string[];
  outputModalities: string[];
  capabilities: Array<{ capability: string; status: string; source: string | null }>;
  apiSupported: boolean;
  isDemo: boolean;
  aliases: string[];
  baseline: { inputPerM: number; outputPerM: number; source: string | null; isDemo: boolean } | null;
  bestOffer: {
    offerId: string;
    sellerName: string;
    inputPerM: number;
    outputPerM: number;
    discountPct: number | null;
    p50LatencyMs: number | null;
    reliabilityScore: number | null;
    healthStatus: string;
    isDemo: boolean;
  } | null;
  offerCount: number;
  healthyOfferCount: number;
  requests7d: number;
  qualityScore: number | null;
  p50LatencyMs: number | null;
  successRate: number | null;
}

/** Full catalog with market data. Cached briefly; filtering happens in memory (catalog is small). */
export async function getCatalog(): Promise<CatalogModel[]> {
  return cached('catalog:v1', 20, buildCatalog);
}

async function buildCatalog(): Promise<CatalogModel[]> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [models, popularity] = await Promise.all([
    prisma.model.findMany({
      include: {
        provider: { select: { id: true, name: true } },
        capabilities: { select: { capability: true, status: true, source: true }, orderBy: { capability: 'asc' } },
        offers: {
          where: { status: 'ACTIVE', validatedAt: { not: null }, endpoint: { status: 'VERIFIED' }, ...(env.DEMO_MODE ? {} : { isDemo: false }) },
          include: { sellerOrg: { select: { name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.inferenceRequest.groupBy({ by: ['modelId'], where: { createdAt: { gte: since }, status: 'SUCCESS' }, _count: { _all: true } }),
  ]);
  const allOffers = models.flatMap((m) => m.offers);
  const [metrics, quality] = await Promise.all([getOfferMetrics(allOffers.map((o) => o.id)), getQualityScores(models.map((m) => m.id))]);
  const pop = new Map(popularity.map((p) => [p.modelId, p._count._all]));

  return models.map((m) => {
    const baselineBlend =
      m.baselineInputPrice !== null && m.baselineOutputPrice !== null ? blendedPrice(m.baselineInputPrice, m.baselineOutputPrice) : null;
    const routable = m.offers.filter((o) => o.healthStatus !== 'UNHEALTHY');
    const best = [...routable].sort((a, b) => blendedPrice(a.inputPrice, a.outputPrice) - blendedPrice(b.inputPrice, b.outputPrice))[0];
    const latencies = m.offers.map((o) => metrics.get(o.id)?.stats.p50LatencyMs).filter((v): v is number => v != null);
    let attempts = 0;
    let ok = 0;
    for (const o of m.offers) {
      const s = metrics.get(o.id)?.stats;
      if (s?.successRate != null) {
        attempts += s.samples;
        ok += s.successRate * s.samples;
      }
    }
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      description: m.description,
      family: m.family,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      inputModalities: m.inputModalities,
      outputModalities: m.outputModalities,
      capabilities: m.capabilities,
      apiSupported: m.apiSupported,
      isDemo: m.isDemo,
      aliases: m.aliases,
      baseline:
        m.baselineInputPrice !== null && m.baselineOutputPrice !== null
          ? { inputPerM: pricePerMToUsd(m.baselineInputPrice)!, outputPerM: pricePerMToUsd(m.baselineOutputPrice)!, source: m.baselinePriceSource, isDemo: m.baselinePriceIsDemo }
          : null,
      bestOffer: best
        ? {
            offerId: best.id,
            sellerName: best.sellerOrg.name,
            inputPerM: pricePerMToUsd(best.inputPrice)!,
            outputPerM: pricePerMToUsd(best.outputPrice)!,
            discountPct: baselineBlend ? Number(((1 - blendedPrice(best.inputPrice, best.outputPrice) / baselineBlend) * 100).toFixed(1)) : null,
            p50LatencyMs: metrics.get(best.id)?.stats.p50LatencyMs ?? null,
            reliabilityScore: metrics.get(best.id)?.reliability.score ?? null,
            healthStatus: best.healthStatus,
            isDemo: best.isDemo,
          }
        : null,
      offerCount: m.offers.length,
      healthyOfferCount: routable.length,
      requests7d: pop.get(m.id) ?? 0,
      qualityScore: quality.get(m.id) ?? null,
      p50LatencyMs: latencies.length ? Math.min(...latencies) : null,
      successRate: attempts ? ok / attempts : null,
    };
  });
}
