import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PublicConfig } from '@/types/api';

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => api.get<PublicConfig>('/api/config/public'), staleTime: 5 * 60_000 });
}
