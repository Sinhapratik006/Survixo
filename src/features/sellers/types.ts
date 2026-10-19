import type { OfferStats, ReliabilityScore } from '@/types/api';

export interface SellerOverview {
  sellerBalanceUsd: number;
  pendingPayoutsUsd: number;
  platformFeeBps: number;
  endpoints: number;
  offersByStatus: Record<string, number>;
  last30d: {
    requests: number;
    earningsUsd: number;
    attempts: number;
    errorRate: number | null;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
  };
  series: Array<{ day: string; requests: number; earningsUsd: number; tokens: number }>;
}

export type EndpointStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED';

export interface SellerEndpoint {
  id: string;
  name: string;
  adapter: string;
  baseUrl: string;
  status: EndpointStatus;
  statusMessage: string | null;
  discoveredModels: string[];
  discoveredModelCount: number;
  credentialHint: string | null;
  credentialRotatedAt: string | null;
  lastVerifiedAt: string | null;
  offerCount?: number;
  createdAt: string;
}

export type OfferStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'ARCHIVED';

export interface SellerOffer {
  id: string;
  modelId: string;
  modelName?: string;
  endpointId: string;
  endpointName?: string;
  adapter?: string;
  upstreamModel: string;
  inputPriceUsd: number;
  outputPriceUsd: number;
  status: OfferStatus;
  healthStatus: 'UNKNOWN' | 'HEALTHY' | 'UNHEALTHY';
  consecutiveFailures: number;
  unhealthyUntil: string | null;
  lastFailureReason: string | null;
  verifiedCapabilities: string[];
  validatedAt: string | null;
  validationError: string | null;
  maxConcurrency: number;
  rpmLimit: number;
  timeoutMs: number;
  dailySpendCapUsd: number | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: OfferStats | null;
  reliability?: ReliabilityScore | null;
}

export interface HealthCheck {
  id: string;
  offerId: string;
  kind: string;
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  checkedAt: string;
  modelId?: string;
  upstreamModel?: string;
}

export interface OfferDetail {
  offer: SellerOffer;
  stats: OfferStats | null;
  reliability: ReliabilityScore | null;
  healthChecks: HealthCheck[];
  priceHistory: Array<{ at: string; inputPriceUsd: number; outputPriceUsd: number }>;
}

export interface Payout {
  id: string;
  amountUsd: number;
  status: 'REQUESTED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED';
  destination: string | null;
  externalRef: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface PayoutsResponse {
  data: Payout[];
  payoutProviderConfigured: boolean;
  notice: string;
}

export interface ValidationResult {
  ok: boolean;
  steps: Array<{ name: string; ok: boolean; detail: string }>;
  offer: SellerOffer;
}
