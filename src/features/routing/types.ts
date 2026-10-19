import type { RoutingTrace } from '@/types/api';

export const ROUTING_MODES = ['LOWEST_COST', 'BALANCED', 'QUALITY_FIRST', 'PREFERRED_PROVIDER', 'CUSTOM'] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];

export const MODE_INFO: Record<RoutingMode, { label: string; description: string }> = {
  LOWEST_COST: { label: 'Lowest cost', description: 'Cheapest eligible offer by estimated request cost.' },
  BALANCED: { label: 'Balanced', description: 'Weighs cost (60%) against measured median latency (40%).' },
  QUALITY_FIRST: { label: 'Quality first', description: 'Highest published benchmark score first; reliability, then cost, break ties.' },
  PREFERRED_PROVIDER: { label: 'Preferred provider', description: 'Offers from your preferred providers or sellers first, then lowest cost.' },
  CUSTOM: { label: 'Custom weights', description: 'Your own weights for price, latency, quality and reliability.' },
};

export interface RoutingPolicy {
  id: string;
  name: string;
  mode: RoutingMode;
  isDefault: boolean;
  maxInputPriceUsd: number | null;
  maxOutputPriceUsd: number | null;
  minDiscountPct: number | null;
  maxLatencyMs: number | null;
  minReliability: number | null;
  minQualityScore: number | null;
  allowedProviders: string[];
  blockedProviders: string[];
  preferredSellers: string[];
  allowDemoOffers: boolean;
  maxRetries: number;
  timeoutMs: number;
  weights: { price: number; latency: number; quality: number; reliability: number };
  updatedAt: string;
}

export interface PoliciesResponse {
  data: RoutingPolicy[];
  platformDefault: { mode: RoutingMode; maxRetries: number; timeoutMs: number };
}

export type PolicyBody = Omit<RoutingPolicy, 'id' | 'updatedAt' | 'weights'> & { weights?: RoutingPolicy['weights'] };

export function policyToBody(p: RoutingPolicy, patch: Partial<PolicyBody> = {}): PolicyBody {
  const { id: _id, updatedAt: _u, ...rest } = p;
  return { ...rest, ...patch };
}

export interface SimulateResponse {
  policy: { id: string | null; name: string; mode: RoutingMode };
  trace: RoutingTrace;
}
