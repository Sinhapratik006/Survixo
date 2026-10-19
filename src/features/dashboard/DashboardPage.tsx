import { useCallback, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Circle, CreditCard, FlaskConical, KeyRound, PiggyBank, Route, ShieldCheck, Store, Wallet } from 'lucide-react';
import {
  Alert,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DemoBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Skeleton,
  StatCard,
  StatusBadge,
  Table,
  Th,
} from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMs, formatNumber, formatRatio, formatUsd } from '@/lib/format';
import { useActiveOrg, useCan } from '@/features/auth/useSession';
import { useConfig } from '@/hooks/useConfig';
import { useApiKeys } from '@/features/api-keys/useApiKeys';
import { ChartCard, CostVsBaselineChart, RequestsChart } from '@/features/usage/charts';
import { useUsageSummary } from '@/features/usage/hooks';
import { RequestRow } from '@/features/usage/RequestRow';
import { RequestTraceModal } from '@/features/usage/RequestTraceModal';
import type { DashboardSummary } from '@/features/usage/types';
import { DaysSelector, ProgressBar, useDocumentTitle, useOrgId, type DayOption } from './shared';

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const orgId = useOrgId();
  const org = useActiveOrg();
  const canViewUsage = useCan('usage:view');
  const { data: config } = useConfig();
  const [days, setDays] = useState<DayOption>(30);
  const [traceId, setTraceId] = useState<string | null>(null);
  // Stable callback: the modal re-runs its focus effect when onClose changes identity.
  const closeTrace = useCallback(() => setTraceId(null), []);

  const summary = useQuery({
    queryKey: ['dashboard-summary', orgId],
    queryFn: () => api.get<DashboardSummary>('/api/dashboard/summary'),
    enabled: Boolean(orgId) && canViewUsage,
    refetchInterval: 60_000,
  });
  const usage = useUsageSummary({ days, enabled: canViewUsage });
  const keys = useApiKeys();

  const s = summary.data;
  const isNew = s ? s.last30d.requests === 0 && s.recentRequests.length === 0 : false;

  if (!canViewUsage) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <EmptyState title="Limited access" description="Your role in this organization cannot view usage. Ask an owner or admin for access." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={org ? `Welcome back${org.personal ? '' : ` to ${org.name}`}` : 'Dashboard'}
        description="Your balance, spend, savings and request health at a glance."
        badge={config?.demoMode ? <DemoBadge label="Demo mode" title="Demo adapters, demo offers and demo credits are enabled on this server" /> : undefined}
        actions={<QuickActions />}
      />

      {config?.demoMode && (
        <Alert tone="demo" className="mb-6" title="Demo environment">
          Demo credit is not real money, and responses from demo offers are simulated. Baseline prices and demo offers are illustrative, not live market data.
        </Alert>
      )}

      {summary.error ? (
        <Card className="mb-6">
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} title="Could not load your dashboard" />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {!s ? (
              Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
            ) : (
              <>
                <StatCard
                  label="Available balance"
                  value={formatUsd(s.balanceUsd)}
                  icon={<Wallet className="h-4 w-4" aria-hidden />}
                  hint={s.heldUsd > 0 ? `${formatUsd(s.heldUsd)} held for in-flight requests` : 'No funds currently held'}
                  tone={s.balanceUsd <= 0 ? 'warning' : 'default'}
                  badge={config?.billingMode === 'demo' ? <DemoBadge label="Demo credit" title="Demo credit is not real money" /> : undefined}
                />
                <StatCard label="Today's spend" value={formatUsd(s.todaySpendUsd)} hint="UTC day, settled requests" />
                <StatCard label="Month to date" value={formatUsd(s.monthSpendUsd)} hint={s.inFlightUsd > 0 ? `+ ${formatUsd(s.inFlightUsd)} in flight` : 'UTC month, settled requests'} />
                <StatCard
                  label="Estimated savings (30d)"
                  value={formatUsd(s.last30d.estimatedSavingsUsd)}
                  icon={<PiggyBank className="h-4 w-4" aria-hidden />}
                  tone={s.last30d.estimatedSavingsUsd > 0 ? 'success' : 'default'}
                  hint="vs. baseline reference prices"
                />
                <StatCard label="Requests (30d)" value={formatNumber(s.last30d.requests)} hint={`${formatNumber(s.last30d.failures)} failed`} />
                <StatCard label="Error rate (30d)" value={formatRatio(s.last30d.errorRate)} tone={(s.last30d.errorRate ?? 0) > 0.05 ? 'warning' : 'default'} />
                <StatCard label="Latency p50 / p95" value={`${formatMs(s.last30d.p50LatencyMs)} / ${formatMs(s.last30d.p95LatencyMs)}`} hint="successful requests, 30d" />
                <BudgetCard summary={s} />
              </>
            )}
          </div>

          {s && s.sellerBalanceUsd > 0 && (
            <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-3 text-sm">
                <Store className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden />
                <span>
                  You have <span className="num font-semibold text-emerald-600 dark:text-emerald-400">{formatUsd(s.sellerBalanceUsd)}</span> in seller earnings.
                </span>
              </div>
              <ButtonLink to="/dashboard/sellers" variant="outline" size="sm">
                Seller overview
              </ButtonLink>
            </Card>
          )}

          {isNew && <OnboardingChecklist summary={s!} keyCount={keys.data?.filter((k) => k.status === 'active').length ?? 0} />}
        </>
      )}

      {!isNew && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Activity</h2>
            <DaysSelector value={days} onChange={setDays} label="Chart date range" />
          </div>
          {usage.error && !usage.data ? (
            <Card className="mb-6">
              <ErrorState error={usage.error} onRetry={() => usage.refetch()} title="Could not load usage charts" />
            </Card>
          ) : (
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              <ChartCard
                title="Daily spend"
                unit="USD per day · green = savings vs. baseline reference prices"
                loading={usage.isLoading}
                empty={!usage.isLoading && (usage.data?.totals.costUsd ?? 0) === 0 && (usage.data?.totals.baselineUsd ?? 0) === 0}
                footer={usage.data ? <Link to={`/dashboard/usage?days=${days}`} className="text-brand-700 hover:underline dark:text-brand-300">Open usage details →</Link> : undefined}
              >
                {usage.data && <CostVsBaselineChart series={usage.data.series} />}
              </ChartCard>
              <ChartCard title="Daily requests" unit="requests per day, succeeded vs. failed" loading={usage.isLoading} empty={!usage.isLoading && (usage.data?.totals.requests ?? 0) === 0}>
                {usage.data && <RequestsChart series={usage.data.series} />}
              </ChartCard>
            </div>
          )}

          <div className="mb-6 grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader title="Recent requests" description="Click a request to inspect its routing trace" actions={<ButtonLink to="/dashboard/usage" variant="ghost" size="sm">View all</ButtonLink>} />
              {!s ? (
                <LoadingBlock rows={5} className="p-5" />
              ) : s.recentRequests.length === 0 ? (
                <EmptyState title="No requests yet" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Time</Th>
                      <Th>Model</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Tokens</Th>
                      <Th className="text-right">Cost</Th>
                      <Th className="text-right">Latency</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.recentRequests.map((r) => (
                      <RequestRow key={r.id} r={r} onOpen={setTraceId} compact />
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader title="Top models (30d)" description="By spend" />
                <CardBody className="pt-3">
                  {!s ? (
                    <LoadingBlock rows={3} />
                  ) : s.topModels.length === 0 ? (
                    <p className="text-sm text-muted">No model usage yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {s.topModels.map((m) => {
                        const max = s.topModels[0]?.costUsd || 1;
                        return (
                          <li key={m.modelId}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <Link to={`/dashboard/usage?modelId=${encodeURIComponent(m.modelId)}`} className="truncate font-mono text-xs text-brand-700 hover:underline dark:text-brand-300">
                                {m.modelId}
                              </Link>
                              <span className="num shrink-0 text-slate-700 dark:text-slate-200">
                                {formatUsd(m.costUsd)} <span className="text-xs text-muted">· {formatNumber(m.requests)} req</span>
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-50 dark:bg-navy-700" aria-hidden>
                              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(2, (m.costUsd / max) * 100)}%` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Provider status" description="Active offers for models you used in the last 30 days" actions={<ButtonLink to="/status" variant="ghost" size="sm">Status page</ButtonLink>} />
                <CardBody className="pt-3">
                  {!s ? (
                    <LoadingBlock rows={3} />
                  ) : s.providerStatus.length === 0 ? (
                    <p className="text-sm text-muted">No models in use yet.</p>
                  ) : (
                    <ul className="divide-y divide-brand-50 dark:divide-navy-700">
                      {s.providerStatus.map((p) => {
                        const state = p.healthy === 0 ? 'outage' : p.unhealthy > 0 ? 'degraded' : 'operational';
                        return (
                          <li key={p.modelId} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <span className="truncate font-mono text-xs">{p.modelId}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="num text-xs text-muted">
                                {p.healthy}/{p.total} healthy
                              </span>
                              <StatusBadge status={state} />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}

      <RequestTraceModal requestId={traceId} onClose={closeTrace} onOpenRequest={setTraceId} />
    </>
  );
}

function QuickActions() {
  const canKeys = useCan('keys:manage');
  const canInfer = useCan('inference:use');
  const canBilling = useCan('billing:manage');
  const canRouting = useCan('routing:view');
  return (
    <>
      {canKeys && (
        <ButtonLink to="/dashboard/api-keys?create=1" leftIcon={<KeyRound className="h-4 w-4" aria-hidden />}>
          Create API key
        </ButtonLink>
      )}
      {canInfer && (
        <ButtonLink to="/dashboard/playground" variant="outline" leftIcon={<FlaskConical className="h-4 w-4" aria-hidden />}>
          Open playground
        </ButtonLink>
      )}
      {canBilling && (
        <ButtonLink to="/dashboard/billing#funding" variant="outline" leftIcon={<CreditCard className="h-4 w-4" aria-hidden />}>
          Add credit
        </ButtonLink>
      )}
      {canRouting && (
        <ButtonLink to="/dashboard/routing" variant="outline" leftIcon={<Route className="h-4 w-4" aria-hidden />}>
          Configure routing
        </ButtonLink>
      )}
    </>
  );
}

function BudgetCard({ summary: s }: { summary: DashboardSummary }) {
  const b = s.budget;
  const monthly = b?.monthlyLimitUsd != null ? { limit: b.monthlyLimitUsd, remaining: b.monthlyRemainingUsd ?? 0, spent: s.monthSpendUsd, label: 'monthly' } : null;
  const daily = b?.dailyLimitUsd != null ? { limit: b.dailyLimitUsd, remaining: b.dailyRemainingUsd ?? 0, spent: s.todaySpendUsd, label: 'daily' } : null;
  const active = monthly ?? daily;
  if (!active) {
    return (
      <div className="card flex flex-col justify-between p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Budget remaining</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No spend limit set.</p>
        <Link to="/dashboard/billing#budget" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Set a budget <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    );
  }
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Budget remaining</p>
        <Link to="/dashboard/billing#budget" className="text-xs text-brand-700 hover:underline dark:text-brand-300">
          Edit
        </Link>
      </div>
      <p className={cn('num mt-2 text-2xl font-semibold tracking-tight', active.remaining <= 0 ? 'text-red-600' : 'text-slate-900 dark:text-white')}>{formatUsd(Math.max(0, active.remaining))}</p>
      <ProgressBar value={active.spent} max={active.limit} label={`${active.label} budget used`} className="mt-2" />
      <p className="mt-1 text-xs text-muted">
        <span className="num">{formatUsd(active.spent)}</span> of <span className="num">{formatUsd(active.limit)}</span> {active.label}
        {b?.hardLimit ? ' · hard limit' : ' · alerts only'}
      </p>
    </div>
  );
}

function OnboardingChecklist({ summary: s, keyCount }: { summary: DashboardSummary; keyCount: number }) {
  const steps: Array<{ done: boolean; title: string; body: ReactNode; to: string; cta: string }> = [
    { done: s.balanceUsd > 0, title: 'Add credit', body: 'Requests reserve their worst-case cost from your balance before dispatch.', to: '/dashboard/billing#funding', cta: 'Add credit' },
    { done: keyCount > 0, title: 'Create an API key', body: 'Keys are shown once and stored only as a hash.', to: '/dashboard/api-keys?create=1', cta: 'Create key' },
    { done: s.recentRequests.length > 0, title: 'Send your first request', body: 'Try any model in the Playground, or call the OpenAI-compatible API.', to: '/dashboard/playground', cta: 'Open playground' },
    { done: false, title: 'Tune routing', body: 'Choose lowest cost, balanced, quality-first or custom weights, and simulate the result.', to: '/dashboard/routing', cta: 'Configure routing' },
    { done: s.budget !== null, title: 'Set a budget guard', body: 'Daily, monthly, per-request and per-task limits with alerts.', to: '/dashboard/billing#budget', cta: 'Set budget' },
  ];
  const completed = steps.filter((x) => x.done).length;
  return (
    <Card className="mb-6">
      <CardHeader title="Get started with Nexovra" description={`${completed} of ${steps.length} steps complete. Charts and request history appear after your first request.`} />
      <ol className="divide-y divide-brand-50 dark:divide-navy-700">
        {steps.map((step) => (
          <li key={step.title} className="flex flex-wrap items-center gap-4 px-5 py-4">
            {step.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-label="Done" /> : <Circle className="h-5 w-5 shrink-0 text-slate-300 dark:text-navy-500" aria-label="Not done" />}
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', step.done ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-900 dark:text-white')}>{step.title}</p>
              <p className="text-sm text-muted">{step.body}</p>
            </div>
            {!step.done && (
              <ButtonLink to={step.to} variant="outline" size="sm">
                {step.cta}
              </ButtonLink>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
