import { useEffect, useState } from 'react';
import { Activity, Boxes, Layers, Server, Store, Zap } from 'lucide-react';
import { Alert, Card, CardBody, CardHeader, DemoBadge, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, formatRatio, formatRelative } from '@/lib/format';
import { ActivityChart, ChartCard, LatencyChart, OffersByModelChart, PriceMovementsChart, RequestVolumeChart, SavingsChart } from './charts';
import { hasDemoData, isEmpty, useAnalytics, type AnalyticsRange } from './useAnalytics';

const RANGES: AnalyticsRange[] = [7, 30, 90];

const DEFINITION_LABEL: Record<string, string> = {
  estimatedSavings: 'Estimated savings',
  realizedSavings: 'Realized savings',
  baseline: 'Baseline price',
};

function RangeSelector({ value, onChange }: { value: AnalyticsRange; onChange: (v: AnalyticsRange) => void }) {
  return (
    <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-lg border border-brand-100 bg-white p-0.5 dark:border-navy-600 dark:bg-navy-800">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === r ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-navy-700 dark:hover:text-white',
          )}
        >
          {r} days
        </button>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState<AnalyticsRange>(30);
  const query = useAnalytics(days);
  const data = query.data;
  const loading = query.isLoading;
  const demo = hasDemoData(data);

  useEffect(() => {
    document.title = 'Market analytics · Nexovra';
  }, []);

  return (
    <div className="container-page py-10">
      <PageHeader
        title="Marketplace analytics"
        description="Prices, offer availability, traffic and latency computed from data recorded by the marketplace. Charts only show what was measured — empty periods stay empty."
        badge={demo ? <DemoBadge label="Includes demo data" /> : undefined}
        actions={
          <>
            {data && (
              <span className="text-xs text-muted" title={formatDateTime(data.generatedAt)}>
                Updated {formatRelative(data.generatedAt)}
              </span>
            )}
            <RangeSelector value={days} onChange={setDays} />
          </>
        }
      />

      {demo && data && (
        <Alert tone="demo" title="Demo traffic and offers are included" className="mb-6">
          Includes demo traffic generated against synthetic demo endpoints. {formatRatio(data.demo.requestShare, 0)} of requests and {formatRatio(data.demo.offerShare, 0)} of active offers in this
          window are demo data, so these figures do not represent live market activity.
        </Alert>
      )}

      {query.error ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load marketplace analytics" />
        </Card>
      ) : (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {loading || !data ? (
              Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="card p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-7 w-16" />
                </div>
              ))
            ) : (
              <>
                <StatCard label="Models listed" value={formatNumber(data.totals.modelsListed)} icon={<Boxes className="h-4 w-4" aria-hidden />} hint="In the catalog" />
                <StatCard label="Models with offers" value={formatNumber(data.totals.modelsWithOffers)} icon={<Layers className="h-4 w-4" aria-hidden />} hint="At least one validated offer" />
                <StatCard label="Active offers" value={formatNumber(data.totals.activeOffers)} icon={<Store className="h-4 w-4" aria-hidden />} hint="Validated and active" />
                <StatCard
                  label="Healthy offers"
                  value={formatNumber(data.totals.healthyOffers)}
                  tone={data.totals.healthyOffers > 0 ? 'success' : 'default'}
                  icon={<Zap className="h-4 w-4" aria-hidden />}
                  hint="Healthy or not yet measured"
                />
                <StatCard label="Sellers" value={formatNumber(data.totals.sellers)} icon={<Server className="h-4 w-4" aria-hidden />} hint="With active offers" />
                <StatCard label={`Requests (${data.windowDays}d)`} value={formatNumber(data.totals.requests)} icon={<Activity className="h-4 w-4" aria-hidden />} hint="All outcomes" />
              </>
            )}
          </section>

          <section aria-label="Charts" className="mt-6 grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Model price movements"
              unit={data?.priceMovements.unit ?? 'USD per 1M tokens (blended 3:1)'}
              loading={loading}
              empty={data ? isEmpty.prices(data) : false}
              emptyText="No price history for active offers in this window."
              className="lg:col-span-2"
              height={300}
              footer="Daily lowest blended price across each model's active offers (top 5 models by offer count). Gaps mean no active offer was priced that day."
            >
              {data && <PriceMovementsChart data={data.priceMovements} height={300} />}
            </ChartCard>

            <ChartCard
              title="Available offers by model"
              unit="Number of validated, active offers"
              loading={loading}
              empty={data ? isEmpty.offers(data) : false}
              emptyText="No validated offers are active right now."
              height={300}
            >
              {data && <OffersByModelChart data={data.offersByModel} height={Math.max(220, data.offersByModel.length * 32 + 60)} />}
            </ChartCard>

            <ChartCard title="Request volume" unit="Requests per day (UTC) by outcome" loading={loading} empty={data ? isEmpty.volume(data) : false} emptyText="No requests were recorded in this window." height={300}>
              {data && <RequestVolumeChart data={data.requestVolume} height={300} />}
            </ChartCard>

            <ChartCard
              title="Estimated vs realized savings"
              unit="USD per day, versus catalog baseline prices"
              loading={loading}
              empty={data ? isEmpty.savings(data) : false}
              emptyText="No successful requests with a baseline price in this window."
              footer="Savings compare against catalog baseline reference prices, not provider quotes."
            >
              {data && <SavingsChart data={data.savings} />}
            </ChartCard>

            <ChartCard
              title="Latency distribution"
              unit="Successful request attempts by end-to-end latency"
              loading={loading}
              empty={data ? isEmpty.latency(data) : false}
              emptyText="No successful request attempts were measured in this window."
            >
              {data && <LatencyChart data={data.latencyDistribution} />}
            </ChartCard>

            <ChartCard
              title="Marketplace activity"
              unit="Tokens processed per day (left) and distinct buying organizations (right)"
              loading={loading}
              empty={data ? isEmpty.activity(data) : false}
              emptyText="No marketplace activity was recorded in this window."
              className="lg:col-span-2"
            >
              {data && <ActivityChart data={data.activity} />}
            </ChartCard>
          </section>

          {data && Object.keys(data.definitions).length > 0 && (
            <Card className="mt-6">
              <CardHeader title="Definitions" description="How the figures on this page are calculated." />
              <CardBody>
                <dl className="grid gap-5 md:grid-cols-3">
                  {Object.entries(data.definitions).map(([key, text]) => (
                    <div key={key}>
                      <dt className="text-sm font-semibold text-slate-900 dark:text-white">{DEFINITION_LABEL[key] ?? key}</dt>
                      <dd className="mt-1 text-sm leading-6 text-muted">{text}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-sm font-semibold text-slate-900 dark:text-white">Blended price</dt>
                    <dd className="mt-1 text-sm leading-6 text-muted">Price comparisons weight input and output prices 3:1, assuming three input tokens for every output token.</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
