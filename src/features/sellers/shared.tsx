import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui';
import { api } from '@/lib/api';
import { useActiveOrg } from '@/features/auth/useSession';
import type { ReliabilityScore } from '@/types/api';
import type { HealthCheck, SellerEndpoint, SellerOffer } from './types';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** Org-scoped query key prefix for every seller query. */
export function useSellerKey() {
  const org = useActiveOrg();
  return { orgId: org?.id, base: ['sellers', org?.id] as const };
}

export function useEndpoints(enabled = true) {
  const { orgId, base } = useSellerKey();
  return useQuery({
    queryKey: [...base, 'endpoints'],
    queryFn: () => api.get<{ data: SellerEndpoint[] }>('/api/sellers/endpoints'),
    enabled: Boolean(orgId) && enabled,
  });
}

export function useOffers(enabled = true) {
  const { orgId, base } = useSellerKey();
  return useQuery({
    queryKey: [...base, 'offers'],
    queryFn: () => api.get<{ data: SellerOffer[] }>('/api/sellers/offers'),
    enabled: Boolean(orgId) && enabled,
  });
}

export function useHealthLog(enabled = true) {
  const { orgId, base } = useSellerKey();
  return useQuery({
    queryKey: [...base, 'health-log'],
    queryFn: () => api.get<{ data: HealthCheck[] }>('/api/sellers/health-log'),
    enabled: Boolean(orgId) && enabled,
  });
}

export function ReliabilityBadge({ reliability }: { reliability: ReliabilityScore | null | undefined }) {
  if (!reliability || reliability.score === null)
    return (
      <Badge title={reliability?.explanation ?? 'No observations yet'} className="whitespace-nowrap">
        Insufficient data
      </Badge>
    );
  const tone = reliability.score >= 90 ? 'success' : reliability.score >= 70 ? 'warning' : 'danger';
  return (
    <Badge tone={tone} className="num" title={reliability.explanation}>
      {reliability.score}/100
    </Badge>
  );
}

/** Blended price assuming 3 input tokens per output token (same as the catalog). */
export function blended(input: number, output: number) {
  return (3 * input + output) / 4;
}
