import type { RoutingPolicy } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';
import type { Constraints, RoutingModeName } from './engine.js';

export type EffectivePolicy = Pick<
  RoutingPolicy,
  | 'mode'
  | 'maxInputPrice'
  | 'maxOutputPrice'
  | 'minDiscountPct'
  | 'maxLatencyMs'
  | 'minReliability'
  | 'minQualityScore'
  | 'allowedProviders'
  | 'blockedProviders'
  | 'preferredSellers'
  | 'allowDemoOffers'
  | 'maxRetries'
  | 'timeoutMs'
  | 'weightPrice'
  | 'weightLatency'
  | 'weightQuality'
  | 'weightReliability'
> & { id: string | null; name: string };

export const DEFAULT_POLICY: EffectivePolicy = {
  id: null,
  name: 'Platform default',
  mode: 'LOWEST_COST',
  maxInputPrice: null,
  maxOutputPrice: null,
  minDiscountPct: null,
  maxLatencyMs: null,
  minReliability: null,
  minQualityScore: null,
  allowedProviders: [],
  blockedProviders: [],
  preferredSellers: [],
  allowDemoOffers: true,
  maxRetries: 2,
  timeoutMs: 30_000,
  weightPrice: 0.5,
  weightLatency: 0.2,
  weightQuality: 0.2,
  weightReliability: 0.1,
};

/** Precedence: explicit policy_id > project policy > org default > platform default. */
export async function resolvePolicy(orgId: string, projectId: string | null, policyId?: string): Promise<EffectivePolicy> {
  if (policyId) {
    const p = await prisma.routingPolicy.findFirst({ where: { id: policyId, orgId } });
    if (!p) throw badRequest('Unknown routing policy for this organization', undefined, 'invalid_policy');
    return p;
  }
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, orgId }, include: { routingPolicy: true } });
    if (project?.routingPolicy) return project.routingPolicy;
  }
  const def = await prisma.routingPolicy.findFirst({ where: { orgId, isDefault: true } });
  return def ?? DEFAULT_POLICY;
}

export interface RequestOverrides {
  routing_mode?: RoutingModeName;
  min_discount_pct?: number;
  max_latency_ms?: number;
  min_reliability?: number;
  min_quality_score?: number;
  allowed_providers?: string[];
  blocked_providers?: string[];
  preferred_providers?: string[];
}

const maxOf = (...v: Array<number | null | undefined>) => {
  const n = v.filter((x): x is number => typeof x === 'number');
  return n.length ? Math.max(...n) : null;
};
const minOf = (...v: Array<number | null | undefined>) => {
  const n = v.filter((x): x is number => typeof x === 'number');
  return n.length ? Math.min(...n) : null;
};

/**
 * Merge a stored policy with per-request overrides. Requests may change the
 * mode and preferences but can only tighten limits: the strictest value wins.
 */
export function mergeConstraints(
  policy: EffectivePolicy,
  o: RequestOverrides,
  base: Pick<Constraints, 'requiredCapabilities' | 'requiredInputModalities' | 'estInputTokens' | 'estOutputTokens'>,
): Constraints {
  const allowed =
    policy.allowedProviders.length && o.allowed_providers?.length
      ? policy.allowedProviders.filter((p) => o.allowed_providers!.map((x) => x.toLowerCase()).includes(p.toLowerCase()))
      : o.allowed_providers?.length
        ? o.allowed_providers
        : policy.allowedProviders;
  if (policy.allowedProviders.length && o.allowed_providers?.length && !allowed.length) {
    // Intersection is empty: keep an impossible allowlist so nothing is silently routed.
    allowed.push('__none__');
  }
  return {
    ...base,
    mode: o.routing_mode ?? policy.mode,
    maxInputPrice: policy.maxInputPrice,
    maxOutputPrice: policy.maxOutputPrice,
    minDiscountPct: maxOf(policy.minDiscountPct, o.min_discount_pct),
    maxLatencyMs: minOf(policy.maxLatencyMs, o.max_latency_ms),
    minReliability: maxOf(policy.minReliability, o.min_reliability),
    minQualityScore: maxOf(policy.minQualityScore, o.min_quality_score),
    allowedProviders: allowed,
    blockedProviders: [...new Set([...policy.blockedProviders, ...(o.blocked_providers ?? [])])],
    preferredSellers: o.preferred_providers?.length ? o.preferred_providers : policy.preferredSellers,
    allowDemoOffers: policy.allowDemoOffers,
    weights: {
      price: policy.weightPrice,
      latency: policy.weightLatency,
      quality: policy.weightQuality,
      reliability: policy.weightReliability,
    },
  };
}
