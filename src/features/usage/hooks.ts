import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useOrgId } from '@/features/dashboard/shared';
import type { ModelsResponse } from '@/types/api';
import type { UsageSummary } from './types';

export function useUsageSummary(params: { days: number; apiKeyId?: string; modelId?: string; enabled?: boolean }) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['usage-summary', orgId, params.days, params.apiKeyId ?? '', params.modelId ?? ''],
    queryFn: () => api.get<UsageSummary>('/api/usage/summary', { query: { days: params.days, apiKeyId: params.apiKeyId, modelId: params.modelId } }),
    enabled: Boolean(orgId) && params.enabled !== false,
    placeholderData: (prev) => prev,
  });
}

/** Catalog models available through the chat completions API. */
export function useApiModels() {
  return useQuery({
    queryKey: ['models', 'catalog-by-name'],
    queryFn: () => api.get<ModelsResponse>('/api/models', { query: { sort: 'name' } }),
    staleTime: 5 * 60_000,
    select: (d) => d.data.filter((m) => m.apiSupported),
  });
}
