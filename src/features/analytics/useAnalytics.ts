import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Shape of GET /api/analytics/overview (server/src/services/analytics.ts). */
export interface AnalyticsOverview {
  windowDays: number;
  generatedAt: string;
  totals: {
    modelsListed: number;
    modelsWithOffers: number;
    activeOffers: number;
    healthyOffers: number;
    sellers: number;
    requests: number;
  };
  demo: { requestShare: number; offerShare: number };
  priceMovements: {
    models: Array<{ id: string; name: string }>;
    series: Array<Record<string, string | number | null>>;
    unit: string;
  };
  offersByModel: Array<{ modelId: string; name: string; offers: number; healthy: number }>;
  requestVolume: Array<{ day: string; success: number; failed: number; rejected: number }>;
  savings: Array<{ day: string; estimatedUsd: number; realizedUsd: number }>;
  latencyDistribution: Array<{ bucket: string; count: number }>;
  activity: Array<{ day: string; tokens: number; activeBuyers: number }>;
  definitions: Record<string, string>;
}

export type AnalyticsRange = 7 | 30 | 90;

export function useAnalytics(days: AnalyticsRange) {
  return useQuery({
    queryKey: ['analytics', 'overview', days],
    queryFn: () => api.get<AnalyticsOverview>('/api/analytics/overview', { query: { days } }),
    staleTime: 60_000,
  });
}

export function hasDemoData(data: AnalyticsOverview | undefined): boolean {
  return Boolean(data && (data.demo.requestShare > 0 || data.demo.offerShare > 0));
}

export const isEmpty = {
  prices: (d: AnalyticsOverview) => !d.priceMovements.models.length || d.priceMovements.series.every((row) => d.priceMovements.models.every((m) => row[m.id] == null)),
  offers: (d: AnalyticsOverview) => d.offersByModel.every((r) => r.offers === 0),
  volume: (d: AnalyticsOverview) => d.requestVolume.every((r) => r.success + r.failed + r.rejected === 0),
  savings: (d: AnalyticsOverview) => d.savings.every((r) => r.estimatedUsd === 0 && r.realizedUsd === 0),
  latency: (d: AnalyticsOverview) => d.latencyDistribution.every((r) => r.count === 0),
  activity: (d: AnalyticsOverview) => d.activity.every((r) => r.tokens === 0 && r.activeBuyers === 0),
};
