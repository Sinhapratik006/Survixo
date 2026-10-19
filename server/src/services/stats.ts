import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { RELIABILITY_WINDOW_DAYS, computeReliability, type ReliabilityScore } from './reliability.js';
import type { OfferStats } from '../routing/engine.js';

export interface OfferMetrics {
  stats: OfferStats;
  reliability: ReliabilityScore;
  dailySoldMicros: bigint;
}

interface AttemptRow {
  offerId: string;
  total: bigint;
  ok: bigint;
  p50: number | null;
  p95: number | null;
}
interface HealthRow {
  offerId: string;
  total: bigint;
  ok: bigint;
}
interface SoldRow {
  offerId: string;
  sold: bigint | null;
}

/** Measured stats for offers over the reliability window. */
export async function getOfferMetrics(offerIds: string[]): Promise<Map<string, OfferMetrics>> {
  const result = new Map<string, OfferMetrics>();
  if (!offerIds.length) return result;
  const since = new Date(Date.now() - RELIABILITY_WINDOW_DAYS * 86_400_000);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const ids = Prisma.join(offerIds);

  const [attempts, health, sold] = await Promise.all([
    prisma.$queryRaw<AttemptRow[]>`
      SELECT "offerId", COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE ok)::bigint AS ok,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ok))::float AS p50,
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ok))::float AS p95
      FROM "RequestAttempt" WHERE "offerId" IN (${ids}) AND "createdAt" >= ${since}
      GROUP BY "offerId"`,
    prisma.$queryRaw<HealthRow[]>`
      SELECT "offerId", COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE ok)::bigint AS ok
      FROM "OfferHealthCheck" WHERE "offerId" IN (${ids}) AND "checkedAt" >= ${since}
      GROUP BY "offerId"`,
    prisma.$queryRaw<SoldRow[]>`
      SELECT "offerId", SUM("costMicros")::bigint AS sold FROM "InferenceRequest"
      WHERE "offerId" IN (${ids}) AND "createdAt" >= ${startOfDay} AND status = 'SUCCESS'
      GROUP BY "offerId"`,
  ]);

  const a = new Map(attempts.map((r) => [r.offerId, r]));
  const h = new Map(health.map((r) => [r.offerId, r]));
  const s = new Map(sold.map((r) => [r.offerId, r.sold ?? 0n]));

  for (const id of offerIds) {
    const at = a.get(id);
    const hc = h.get(id);
    const p50 = at?.p50 != null ? Math.round(at.p50) : null;
    const p95 = at?.p95 != null ? Math.round(at.p95) : null;
    const total = Number(at?.total ?? 0n);
    const ok = Number(at?.ok ?? 0n);
    result.set(id, {
      stats: { samples: total, successRate: total ? ok / total : null, p50LatencyMs: p50, p95LatencyMs: p95 },
      reliability: computeReliability({
        requestAttempts: total,
        requestSuccesses: ok,
        healthChecks: Number(hc?.total ?? 0n),
        healthChecksOk: Number(hc?.ok ?? 0n),
        p95LatencyMs: p95,
      }),
      dailySoldMicros: s.get(id) ?? 0n,
    });
  }
  return result;
}

/**
 * Model-level quality score in [0,1]: mean of the latest public benchmark
 * result per benchmark (only benchmarks reported as accuracy fractions).
 * Null when no measured results exist.
 */
export async function getQualityScores(modelIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(modelIds.map((id) => [id, null]));
  if (!modelIds.length) return out;
  const results = await prisma.benchmarkResult.findMany({
    where: { modelId: { in: modelIds }, isPublic: true, scoreUnit: 'accuracy' },
    orderBy: { runAt: 'desc' },
    select: { modelId: true, benchmark: true, score: true },
  });
  const latest = new Map<string, number>();
  for (const r of results) {
    const key = `${r.modelId}|${r.benchmark}`;
    if (!latest.has(key)) latest.set(key, r.score);
  }
  const grouped = new Map<string, number[]>();
  for (const [key, score] of latest) {
    const modelId = key.split('|')[0]!;
    grouped.set(modelId, [...(grouped.get(modelId) ?? []), score]);
  }
  for (const [modelId, scores] of grouped) out.set(modelId, scores.reduce((x, y) => x + y, 0) / scores.length);
  return out;
}
