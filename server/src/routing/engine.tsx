import { tokenCostMicros } from '../lib/money.js';
import type { AdapterFeatures } from '../providers/types.js';

export type RoutingModeName = 'LOWEST_COST' | 'BALANCED' | 'QUALITY_FIRST' | 'PREFERRED_PROVIDER' | 'CUSTOM';

export interface OfferStats {
  samples: number;
  successRate: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface Candidate {
  offerId: string;
  modelId: string;
  modelName: string;
  providerId: string;
  sellerOrgId: string;
  sellerName: string;
  sellerSlug: string;
  endpointId: string;
  adapter: string;
  adapterFeatures: AdapterFeatures;
  upstreamModel: string;
  inputPrice: number;
  outputPrice: number;
  baselineInputPrice: number | null;
  baselineOutputPrice: number | null;
  status: string;
  endpointStatus: string;
  validated: boolean;
  healthStatus: string;
  verifiedCapabilities: string[];
  modelCapabilities: string[];
  inputModalities: string[];
  contextWindow: number | null;
  maxOutputTokens: number | null;
  timeoutMs: number;
  isDemo: boolean;
  stats: OfferStats;
  reliabilityScore: number | null;
  qualityScore: number | null;
  inFlight: number;
  maxConcurrency: number;
  rpmUsed: number;
  rpmLimit: number;
  dailySpendCapMicros: bigint | null;
  dailySoldMicros: bigint;
}

export interface Weights {
  price: number;
  latency: number;
  quality: number;
  reliability: number;
}

export interface Constraints {
  mode: RoutingModeName;
  requiredCapabilities: string[];
  requiredInputModalities: string[];
  estInputTokens: number;
  estOutputTokens: number;
  maxInputPrice?: number | null;
  maxOutputPrice?: number | null;
  minDiscountPct?: number | null;
  maxLatencyMs?: number | null;
  minReliability?: number | null;
  minQualityScore?: number | null;
  allowedProviders: string[];
  blockedProviders: string[];
  preferredSellers: string[];
  allowDemoOffers: boolean;
  weights?: Weights;
}

export interface RankedCandidate {
  candidate: Candidate;
  estCostMicros: bigint;
  baselineCostMicros: bigint | null;
  discountPct: number | null;
  score: number;
}

export interface Rejection {
  offerId: string;
  modelId: string;
  sellerName: string;
  reasons: string[];
}

export interface RoutingDecision {
  mode: RoutingModeName;
  ranked: RankedCandidate[];
  rejected: Rejection[];
  explanation: string;
}

const CAPABILITY_FEATURE: Record<string, keyof AdapterFeatures> = {
  streaming: 'streaming',
  tools: 'tools',
  vision: 'vision',
  json_mode: 'jsonMode',
};

function matchesProvider(c: Candidate, entries: string[]) {
  const set = new Set(entries.map((e) => e.toLowerCase()));
  return set.has(c.providerId.toLowerCase()) || set.has(c.sellerOrgId.toLowerCase()) || set.has(c.sellerSlug.toLowerCase());
}

export function eligibilityReasons(c: Candidate, k: Constraints, estCost: bigint, baseline: bigint | null): string[] {
  const reasons: string[] = [];
  if (c.status !== 'ACTIVE') reasons.push(`Offer is ${c.status.toLowerCase()}`);
  if (c.endpointStatus !== 'VERIFIED') reasons.push('Seller endpoint is not verified');
  if (!c.validated) reasons.push('Offer has not passed validation');
  if (c.healthStatus === 'UNHEALTHY') reasons.push('Offer is unhealthy (waiting for a recovery probe)');
  if (c.isDemo && !k.allowDemoOffers) reasons.push('Demo offers are excluded by policy');

  for (const cap of k.requiredCapabilities) {
    if (!c.modelCapabilities.includes(cap)) reasons.push(`Model does not support "${cap}"`);
    else {
      const feature = CAPABILITY_FEATURE[cap];
      if (feature && !c.adapterFeatures[feature]) reasons.push(`Seller adapter does not support "${cap}"`);
      if (cap === 'streaming' && !c.verifiedCapabilities.includes('streaming'))
        reasons.push('Streaming was not verified for this offer');
    }
  }
  for (const modality of k.requiredInputModalities) {
    if (!c.inputModalities.includes(modality)) reasons.push(`Model does not accept ${modality} input`);
  }
  if (c.contextWindow !== null && k.estInputTokens + k.estOutputTokens > c.contextWindow)
    reasons.push(`Request needs ~${k.estInputTokens + k.estOutputTokens} tokens; context window is ${c.contextWindow}`);

  if (k.allowedProviders.length && !matchesProvider(c, k.allowedProviders)) reasons.push('Provider is not in the allowlist');
  if (k.blockedProviders.length && matchesProvider(c, k.blockedProviders)) reasons.push('Provider is blocked by policy');

  if (k.maxInputPrice != null && c.inputPrice > k.maxInputPrice) reasons.push('Input price exceeds policy limit');
  if (k.maxOutputPrice != null && c.outputPrice > k.maxOutputPrice) reasons.push('Output price exceeds policy limit');
  if (k.minDiscountPct != null) {
    if (baseline === null || baseline === 0n) reasons.push('No baseline price available to verify the minimum discount');
    else {
      const discount = discountPct(estCost, baseline);
      if (discount < k.minDiscountPct) reasons.push(`Estimated discount ${discount.toFixed(1)}% is below the ${k.minDiscountPct}% minimum`);
    }
  }
  if (k.maxLatencyMs != null) {
    if (c.stats.p50LatencyMs === null) reasons.push('No latency measurements yet');
    else if (c.stats.p50LatencyMs > k.maxLatencyMs)
      reasons.push(`Median latency ${c.stats.p50LatencyMs} ms exceeds ${k.maxLatencyMs} ms target`);
  }
  if (k.minReliability != null) {
    if (c.reliabilityScore === null) reasons.push('Insufficient data for a reliability score');
    else if (c.reliabilityScore < k.minReliability)
      reasons.push(`Reliability ${c.reliabilityScore} is below the minimum ${k.minReliability}`);
  }
  if (k.minQualityScore != null) {
    if (c.qualityScore === null) reasons.push('No benchmark results for this model');
    else if (c.qualityScore < k.minQualityScore)
      reasons.push(`Benchmark score ${(c.qualityScore * 100).toFixed(0)}% is below the minimum ${(k.minQualityScore * 100).toFixed(0)}%`);
  }
  if (c.inFlight >= c.maxConcurrency) reasons.push('Offer is at its concurrency limit');
  if (c.rpmUsed >= c.rpmLimit) reasons.push('Offer reached its requests-per-minute limit');
  if (c.dailySpendCapMicros !== null && c.dailySoldMicros + estCost > c.dailySpendCapMicros)
    reasons.push("Offer reached the seller's daily capacity cap");
  return reasons;
}

export function discountPct(cost: bigint, baseline: bigint): number {
  if (baseline <= 0n) return 0;
  return (1 - Number(cost) / Number(baseline)) * 100;
}

function normalize(values: Array<number | null>, unknownPenalty = 1): number[] {
  const known = values.filter((v): v is number => v !== null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  return values.map((v) => {
    if (v === null) return unknownPenalty;
    if (!known.length || max === min) return 0;
    return (v - min) / (max - min);
  });
}

export function rankCandidates(candidates: Candidate[], k: Constraints): RoutingDecision {
  const eligible: RankedCandidate[] = [];
  const rejected: Rejection[] = [];

  for (const c of candidates) {
    const estCost = tokenCostMicros(k.estInputTokens, k.estOutputTokens, c.inputPrice, c.outputPrice);
    const baseline =
      c.baselineInputPrice !== null && c.baselineOutputPrice !== null
        ? tokenCostMicros(k.estInputTokens, k.estOutputTokens, c.baselineInputPrice, c.baselineOutputPrice)
        : null;
    const reasons = eligibilityReasons(c, k, estCost, baseline);
    if (reasons.length) {
      rejected.push({ offerId: c.offerId, modelId: c.modelId, sellerName: c.sellerName, reasons });
      continue;
    }
    eligible.push({
      candidate: c,
      estCostMicros: estCost,
      baselineCostMicros: baseline,
      discountPct: baseline ? discountPct(estCost, baseline) : null,
      score: 0,
    });
  }

  const costs = normalize(eligible.map((e) => Number(e.estCostMicros)));
  const lat = normalize(eligible.map((e) => e.candidate.stats.p50LatencyMs), 0.75);
  const quality = normalize(eligible.map((e) => e.candidate.qualityScore));
  const reliability = normalize(eligible.map((e) => e.candidate.reliabilityScore));

  eligible.forEach((e, i) => {
    switch (k.mode) {
      case 'LOWEST_COST':
        e.score = Number(e.estCostMicros);
        break;
      case 'BALANCED':
        e.score = 0.6 * costs[i]! + 0.4 * lat[i]!;
        break;
      case 'QUALITY_FIRST':
        // Higher quality first; unknown quality sorts last. Reliability then cost break ties.
        e.score = -(e.candidate.qualityScore ?? -1) * 1e6 - (e.candidate.reliabilityScore ?? 0) * 10 + costs[i]!;
        break;
      case 'PREFERRED_PROVIDER':
        e.score = (matchesProvider(e.candidate, k.preferredSellers) ? 0 : 1e15) + Number(e.estCostMicros);
        break;
      case 'CUSTOM': {
        const w = k.weights ?? { price: 0.5, latency: 0.2, quality: 0.2, reliability: 0.1 };
        const qualityKnown = e.candidate.qualityScore !== null;
        const relKnown = e.candidate.reliabilityScore !== null;
        e.score =
          w.price * costs[i]! +
          w.latency * lat[i]! +
          w.quality * (qualityKnown ? 1 - quality[i]! : 1) +
          w.reliability * (relKnown ? 1 - reliability[i]! : 1);
        break;
      }
    }
  });

  eligible.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const la = a.candidate.stats.p50LatencyMs ?? Number.MAX_SAFE_INTEGER;
    const lb = b.candidate.stats.p50LatencyMs ?? Number.MAX_SAFE_INTEGER;
    if (la !== lb) return la - lb;
    return a.candidate.offerId.localeCompare(b.candidate.offerId);
  });

  return { mode: k.mode, ranked: eligible, rejected, explanation: explain(k, eligible, rejected) };
}

const MODE_LABEL: Record<RoutingModeName, string> = {
  LOWEST_COST: 'lowest estimated cost',
  BALANCED: 'balanced cost and measured latency',
  QUALITY_FIRST: 'highest measured benchmark score',
  PREFERRED_PROVIDER: 'preferred providers first, then cost',
  CUSTOM: 'custom weighted policy',
};

export function explain(k: Constraints, ranked: RankedCandidate[], rejected: Rejection[]): string {
  if (!ranked.length) {
    return `No eligible offer among ${rejected.length} candidate(s). ${summarizeRejections(rejected)}`.trim();
  }
  const top = ranked[0]!;
  const parts = [
    `Selected ${top.candidate.sellerName} for ${top.candidate.modelId} by ${MODE_LABEL[k.mode]} among ${ranked.length} eligible offer(s).`,
    `Estimated cost $${(Number(top.estCostMicros) / 1e6).toFixed(6)}`,
  ];
  if (top.discountPct !== null) parts.push(`(${top.discountPct.toFixed(1)}% below the baseline estimate)`);
  if (top.candidate.stats.p50LatencyMs !== null) parts.push(`; median latency ${top.candidate.stats.p50LatencyMs} ms`);
  if (rejected.length) parts.push(`. ${rejected.length} offer(s) were ineligible.`);
  return parts.join(' ').replace(' ;', ';').replace(' .', '.');
}

export function summarizeRejections(rejected: Rejection[]): string {
  const counts = new Map<string, number>();
  for (const r of rejected) for (const reason of r.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, n]) => `${reason} (${n})`)
    .join('; ');
}
