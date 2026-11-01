export const RELIABILITY_MIN_SAMPLES = 30;
export const RELIABILITY_WINDOW_DAYS = 7;

export interface ReliabilityInput {
  requestAttempts: number;
  requestSuccesses: number;
  healthChecks: number;
  healthChecksOk: number;
  p95LatencyMs: number | null;
}

export interface ReliabilityScore {
  score: number | null;
  sampleSize: number;
  windowDays: number;
  successRate: number | null;
  successRateLowerBound: number | null;
  latencyComponent: number | null;
  p95LatencyMs: number | null;
  explanation: string;
}

/** Wilson score interval lower bound (95%): penalizes small samples. */
export function wilsonLowerBound(successes: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denom);
}

/** 1.0 at or below 1s p95, falling linearly to 0 at 10s. */
export function latencyComponent(p95: number | null): number | null {
  if (p95 === null) return null;
  return Math.min(1, Math.max(0, 1 - (p95 - 1000) / 9000));
}

/**
 * Explainable reliability score (0–100):
 *   80% × Wilson lower bound of the success rate (requests + health probes)
 *   20% × p95 latency component
 * Returns null when fewer than RELIABILITY_MIN_SAMPLES observations exist.
 */
export function computeReliability(input: ReliabilityInput): ReliabilityScore {
  const total = input.requestAttempts + input.healthChecks;
  const successes = input.requestSuccesses + input.healthChecksOk;
  const base = { sampleSize: total, windowDays: RELIABILITY_WINDOW_DAYS, p95LatencyMs: input.p95LatencyMs };
  if (total < RELIABILITY_MIN_SAMPLES) {
    return {
      ...base,
      score: null,
      successRate: total ? successes / total : null,
      successRateLowerBound: null,
      latencyComponent: null,
      explanation: `Insufficient data: ${total} observation(s) in the last ${RELIABILITY_WINDOW_DAYS} days; at least ${RELIABILITY_MIN_SAMPLES} are required before a score is shown.`,
    };
  }
  const lb = wilsonLowerBound(successes, total);
  const lat = latencyComponent(input.p95LatencyMs);
  const score = Math.round(100 * (0.8 * lb + 0.2 * (lat ?? 0.5)));
  return {
    ...base,
    score,
    successRate: successes / total,
    successRateLowerBound: lb,
    latencyComponent: lat,
    explanation: `Based on ${total} observations over ${RELIABILITY_WINDOW_DAYS} days: success rate ${((successes / total) * 100).toFixed(1)}% (95% lower bound ${(lb * 100).toFixed(1)}%)${
      input.p95LatencyMs !== null ? `, p95 latency ${input.p95LatencyMs} ms` : ', no latency data (neutral latency weight)'
    }. Score = 80% success lower bound + 20% latency component.`,
  };
}
