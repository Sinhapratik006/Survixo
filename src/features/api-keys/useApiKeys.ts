import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/features/auth/useSession';
import { useOrgId } from '@/features/dashboard/shared';
import type { ApiKeyRow } from '@/features/usage/types';

export function useApiKeys(opts: { enabled?: boolean } = {}) {
  const orgId = useOrgId();
  const canView = useCan('keys:view');
  return useQuery({
    queryKey: ['api-keys', orgId],
    queryFn: () => api.get<{ data: ApiKeyRow[] }>('/api/api-keys'),
    enabled: Boolean(orgId) && canView && opts.enabled !== false,
    select: (d) => d.data,
  });
}
