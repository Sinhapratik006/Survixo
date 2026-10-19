// Shapes returned by the Nexovra API. Kept in sync with server/src/routes/*.

export type OrgRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'BILLING' | 'VIEWER';

export type Permission =
  | 'org:manage'
  | 'org:delete'
  | 'members:manage'
  | 'billing:manage'
  | 'billing:view'
  | 'budget:manage'
  | 'keys:manage'
  | 'keys:view'
  | 'usage:view'
  | 'inference:use'
  | 'routing:manage'
  | 'routing:view'
  | 'seller:manage'
  | 'seller:view'
  | 'webhooks:manage'
  | 'audit:view'
  | 'projects:manage';

export interface PublicConfig {
  demoMode: boolean;
  billingMode: 'demo' | 'stripe';
  platformFeeBps: number;
  googleAuthEnabled: boolean;
  apiBaseUrl: string;
  adapters: Array<{ id: string; label: string; auth: string; features: Record<string, boolean> }>;
  reliability: { minSamples: number; windowDays: number };
}

export interface Membership {
  id: string;
  name: string;
  slug: string;
  personal: boolean;
  role: OrgRole;
  permissions: Permission[];
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  avatarUrl: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  theme: 'light' | 'dark' | 'system';
  createdAt: string;
  linkedAccounts: Array<{ provider: string; email: string | null; createdAt: string }>;
}

export interface MeResponse {
  user: SessionUser | null;
  memberships: Membership[];
}

export interface Capability {
  capability: string;
  status: 'declared' | 'verified' | string;
  source: string | null;
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
  capabilities: Capability[];
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

export interface ModelsResponse {
  data: CatalogModel[];
  total: number;
  generatedAt: string;
  notes: { blendedPrice: string; demo: string | null };
}

export interface OfferStats {
  samples: number;
  successRate: number | null;
  p50LatencyMs: number | null;
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

export interface BenchmarkResult {
  id: string;
  modelId: string;
  modelName?: string;
  offerId: string | null;
  benchmark: string;
  version: string;
  datasetDescription: string;
  method: string;
  sampleSize: number;
  score: number;
  scoreUnit: string;
  costUsd: number;
  avgLatencyMs: number;
  limitations: string;
  isPublic: boolean;
  isDemo: boolean;
  runAt: string;
}

export interface ModelDetailResponse {
  model: CatalogModel;
  offers: Array<{
    id: string;
    seller: { id: string; name: string; slug: string };
    adapter: string;
    endpointStatus: string;
    inputPerM: number;
    outputPerM: number;
    healthStatus: string;
    verifiedCapabilities: string[];
    maxConcurrency: number;
    rpmLimit: number;
    isDemo: boolean;
    validatedAt: string | null;
    stats: OfferStats | null;
    reliability: ReliabilityScore | null;
  }>;
  benchmarks: BenchmarkResult[];
  priceHistory: Array<{ offerId: string; at: string; inputPerM: number; outputPerM: number }>;
}

export interface InferenceRequestRow {
  id: string;
  createdAt: string;
  completedAt: string | null;
  requestedModel: string;
  modelId: string | null;
  offerId: string | null;
  seller: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  source: 'API' | 'PLAYGROUND' | 'ARENA' | 'BENCHMARK' | 'SEED';
  status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'REJECTED';
  stream: boolean;
  routingMode: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  usageEstimated: boolean;
  costUsd: number;
  baselineCostUsd: number | null;
  holdUsd: number;
  latencyMs: number | null;
  ttftMs: number | null;
  retryCount: number;
  taskId: string | null;
  isDemo: boolean;
}

export interface RoutingTrace {
  mode: string;
  explanation: string;
  ranked: Array<{
    offer_id: string;
    model: string;
    seller: string;
    demo: boolean;
    est_cost_usd: number;
    baseline_est_usd: number | null;
    discount_pct: number | null;
    p50_latency_ms: number | null;
    reliability: number | null;
    quality: number | null;
  }>;
  rejected: Array<{ offer_id: string; model: string; seller: string; reasons: string[] }>;
  constraints?: Record<string, unknown>;
  estimates?: { input_tokens: number; max_output_tokens: number; hold_usd: number };
  policy?: { id: string | null; name: string; max_retries: number };
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{ index: number; message: { role: string; content: string | null }; finish_reason: string }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  nexovra: {
    request_id: string;
    model: string;
    offer_id: string;
    seller: string;
    demo: boolean;
    routing_mode: string;
    routing_reason: string;
    retries: number;
    cost_usd: number;
    baseline_cost_usd: number | null;
    estimated_savings_usd: number | null;
    usage_estimated: boolean;
    latency_ms: number;
  };
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}
