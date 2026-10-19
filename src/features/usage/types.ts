import type { ChatCompletionResponse, InferenceRequestRow, RoutingTrace } from '@/types/api';

export interface UsageSeriesPoint {
  day: string;
  costUsd: number;
  baselineUsd: number;
  requests: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageSummary {
  days: number;
  totals: { costUsd: number; baselineUsd: number; requests: number; failures: number; inputTokens: number; outputTokens: number; errorRate: number | null };
  latency: { p50: number | null; p95: number | null; p99: number | null };
  series: UsageSeriesPoint[];
  byModel: Array<{ modelId: string; costUsd: number; requests: number; failures: number; tokens: number; baselineUsd: number }>;
  byKey: Array<{ apiKeyId: string | null; name: string; costUsd: number; requests: number; failures: number; tokens: number }>;
}

export interface DashboardSummary {
  balanceUsd: number;
  heldUsd: number;
  sellerBalanceUsd: number;
  todaySpendUsd: number;
  monthSpendUsd: number;
  inFlightUsd: number;
  last30d: {
    requests: number;
    failures: number;
    errorRate: number | null;
    costUsd: number;
    baselineUsd: number;
    estimatedSavingsUsd: number;
    tokens: number;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
  };
  budget: {
    dailyLimitUsd: number | null;
    monthlyLimitUsd: number | null;
    dailyRemainingUsd: number | null;
    monthlyRemainingUsd: number | null;
    hardLimit: boolean;
  } | null;
  topModels: Array<{ modelId: string; costUsd: number; requests: number }>;
  recentRequests: InferenceRequestRow[];
  providerStatus: Array<{ modelId: string; healthy: number; unhealthy: number; total: number }>;
}

export interface RequestAttempt {
  attempt: number;
  offerId: string;
  seller: string;
  modelId: string;
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  errorCode: string | null;
  error: string | null;
  at: string;
}

export interface StoredPayload {
  messages?: Array<{ role: string; content: unknown }>;
  params?: Record<string, unknown> & { max_tokens?: number };
}

export interface RequestDetail {
  request: InferenceRequestRow;
  trace: RoutingTrace | null;
  attempts: RequestAttempt[];
  payload: StoredPayload | null;
  payloadNotice: string;
}

export interface ReplayResponse {
  replayOf: string;
  result: ChatCompletionResponse;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  maskedKey: string;
  project: { id: string; name: string; environment: string } | null;
  spendLimitUsd: number | null;
  spentUsd: number;
  rpmLimit: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  rotatedFromId: string | null;
  status: 'active' | 'revoked' | 'expired';
}
