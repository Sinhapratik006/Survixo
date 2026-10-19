import type { BenchmarkResult, CatalogModel } from '@/types/api';
import type { StreamMeta } from '@/services/stream';

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export type ArenaResult =
  | { modelId: string; ok: true; requestId: string; content: string | null; usage: TokenUsage; meta: StreamMeta }
  | { modelId: string; ok: false; requestId: string | null; error: { code: string; message: string }; latencyMs: number };

export interface ArenaRunResponse {
  sessionId: string;
  criteria: string[];
  results: ArenaResult[];
}

export interface ArenaHistorySession {
  id: string;
  createdAt: string;
  promptChars: number;
  criteria: string[];
  entries: Array<{
    modelId: string;
    requestId: string;
    rating: number | null;
    scores: Record<string, number> | null;
    costUsd: number;
    latencyMs: number | null;
    outputTokens: number;
  }>;
}

export interface MatchResponse {
  analysis: {
    capabilities: string[];
    minContextTokens: number | null;
    priorities: { cost: number; latency: number; quality: number };
    signals: string[];
    requiredCapabilities: string[];
  };
  recommendations: Array<{ model: CatalogModel; score: number; reasons: string[]; warnings: string[] }>;
  excluded: Array<{ modelId: string; name: string; reasons: string[] }>;
  method: string;
}

export type OptimizerAction =
  | { kind: 'apply_routing_mode'; policyId: string; mode: 'LOWEST_COST' | 'BALANCED' }
  | { kind: 'link'; href: string; label: string };

export interface OptimizerRecommendation {
  id: string;
  type: 'model_substitution' | 'routing_policy' | 'token_reduction' | 'budget' | 'prompt_caching' | 'batching';
  title: string;
  detail: string;
  projectedMonthlySavingsUsd: number | null;
  assumptions: string[];
  action: OptimizerAction | null;
  requiresApproval: boolean;
}

export interface OptimizerResponse {
  windowDays: number;
  analyzedSpendUsd: number;
  recommendations: OptimizerRecommendation[];
  notApplicable: string[];
  note: string;
}

export type BenchmarkRunItem = { ok: true; modelId: string; result: BenchmarkResult } | { ok: false; modelId: string; error: string };

export interface BenchmarkRunResponse {
  results: BenchmarkRunItem[];
}

export interface RoutingPolicySummary {
  id: string;
  name: string;
  mode: string;
  isDefault: boolean;
}
