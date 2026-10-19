import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Download, FilterX, KeyRound, ListFilter } from 'lucide-react';
import { Button, ButtonLink, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, Select, Skeleton, StatCard, Table, Td, Th, useToast } from '@/components/ui';
import { api, apiHeaders, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCompact, formatMs, formatNumber, formatRatio, formatTokens, formatUsd } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { useApiKeys } from '@/features/api-keys/useApiKeys';
import { DaysSelector, parseDays, useDocumentTitle, useOrgId, type DayOption } from '@/features/dashboard/shared';
import type { InferenceRequestRow, Paginated } from '@/types/api';
import { CostVsBaselineChart, ChartCard, RequestsChart } from './charts';
import { useApiModels, useUsageSummary } from './hooks';
import { RequestRow } from './RequestRow';
import { RequestTraceModal } from './RequestTraceModal';

const STATUSES = ['SUCCESS', 'FAILED', 'REJECTED', 'IN_PROGRESS'] as const;
const SOURCES = ['API', 'PLAYGROUND', 'ARENA', 'BENCHMARK', 'SEED'] as const;
type Status = (typeof STATUSES)[number];
type Source = (typeof SOURCES)[number];

const pick = <T extends string>(list: readonly T[], v: string | null): T | undefined => (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

export default function UsagePage() {
  useDocumentTitle('Usage & requests');
  const [params, setParams] = useSearchParams();
  const days = parseDays(params.get('days'));
  const apiKeyId = params.get('apiKeyId') ?? undefined;
  const modelId = params.get('modelId') ?? undefined;
  const status = pick(STATUSES, params.get('status'));
  const source = pick(SOURCES, params.get('source'));
  const openRequest = params.get('request');
  const logRef = useRef<HTMLDivElement>(null);
  const canViewUsage = useCan('usage:view');

  const update = useCallback(
    (patch: Record<string, string | undefined>, replace = false) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );
  // Stable callbacks keep the modal's focus management from re-running on every render.
  const closeTrace = useCallback(() => update({ request: undefined }, true), [update]);
  const switchTrace = useCallback((id: string) => update({ request: id }, true), [update]);

  const summary = useUsageSummary({ days, apiKeyId, modelId, enabled: canViewUsage });
  const keys = useApiKeys();
  const models = useApiModels();
  const hasFilters = Boolean(apiKeyId || modelId || status || source);

  const showFailures = () => {
    update({ status: 'FAILED' });
    requestAnimationFrame(() => logRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  if (!canViewUsage) {
    return (
      <>
        <PageHeader title="Usage & requests" />
        <Card>
          <EmptyState title="You don't have access to usage data" description="Ask an organization owner or admin for a role with the usage:view permission." />
        </Card>
      </>
    );
  }

  const totals = summary.data?.totals;
  const savings = totals ? totals.baselineUsd - totals.costUsd : null;

  return (
    <>
      <PageHeader
        title="Usage & requests"
        description="Spend, savings, reliability and latency across your API keys and models. Click any request to see its full routing trace."
        actions={
          <>
            <Button variant="outline" onClick={showFailures} leftIcon={<AlertTriangle className="h-4 w-4" aria-hidden />}>
              Inspect failures
            </Button>
            <CsvExportLink days={days} />
          </>
        }
      />

      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Period</p>
            <DaysSelector value={days} onChange={(d: DayOption) => update({ days: String(d) })} />
          </div>
          <label className="min-w-[180px] flex-1 sm:max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">API key</span>
            <Select value={apiKeyId ?? ''} onChange={(e) => update({ apiKeyId: e.target.value || undefined })}>
              <option value="">All keys</option>
              {keys.data?.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.maskedKey}){k.status !== 'active' ? ` · ${k.status}` : ''}
                </option>
              ))}
              {apiKeyId && !keys.data?.some((k) => k.id === apiKeyId) && <option value={apiKeyId}>Selected key</option>}
            </Select>
          </label>
          <label className="min-w-[180px] flex-1 sm:max-w-xs">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Model</span>
            <Select value={modelId ?? ''} onChange={(e) => update({ modelId: e.target.value || undefined })}>
              <option value="">All models</option>
              {models.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              {modelId && !models.data?.some((m) => m.id === modelId) && <option value={modelId}>{modelId}</option>}
            </Select>
          </label>
          {hasFilters && (
            <Button variant="ghost" onClick={() => update({ apiKeyId: undefined, modelId: undefined, status: undefined, source: undefined })} leftIcon={<FilterX className="h-4 w-4" aria-hidden />}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {summary.error && !summary.data ? (
        <Card className="mb-6">
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} title="Could not load usage summary" />
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {summary.isLoading || !totals || !summary.data ? (
            Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
          ) : (
            <>
              <StatCard label="Spend" value={formatUsd(totals.costUsd)} hint={`last ${days} days`} />
              <StatCard label="Baseline reference" value={formatUsd(totals.baselineUsd)} hint="at baseline list prices" />
              <StatCard
                label="Realized savings"
                value={formatUsd(savings)}
                tone={savings && savings > 0 ? 'success' : 'default'}
                hint={totals.baselineUsd > 0 && savings !== null ? `${formatRatio(savings / totals.baselineUsd)} vs. baseline` : 'vs. baseline reference prices'}
              />
              <StatCard label="Requests" value={formatNumber(totals.requests)} />
              <StatCard label="Failures" value={formatNumber(totals.failures)} tone={totals.failures > 0 ? 'danger' : 'default'} />
              <StatCard label="Error rate" value={formatRatio(totals.errorRate)} tone={(totals.errorRate ?? 0) > 0.05 ? 'warning' : 'default'} />
              <StatCard label="p50 latency" value={formatMs(summary.data.latency.p50)} hint="successful requests" />
              <StatCard label="p95 latency" value={formatMs(summary.data.latency.p95)} />
              <StatCard label="p99 latency" value={formatMs(summary.data.latency.p99)} />
              <StatCard label="Tokens" value={formatTokens(totals.inputTokens + totals.outputTokens)} hint={`${formatCompact(totals.inputTokens)} in · ${formatCompact(totals.outputTokens)} out`} />
            </>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Daily spend vs. baseline"
          unit="USD per day · green = savings vs. baseline reference prices"
          loading={summary.isLoading}
          empty={!summary.isLoading && (!totals || (totals.costUsd === 0 && totals.baselineUsd === 0))}
        >
          {summary.data && <CostVsBaselineChart series={summary.data.series} />}
        </ChartCard>
        <ChartCard title="Requests vs. failures" unit="requests per day" loading={summary.isLoading} empty={!summary.isLoading && (!totals || totals.requests === 0)}>
          {summary.data && <RequestsChart series={summary.data.series} />}
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="By model" description={`Last ${days} days`} />
          {summary.isLoading ? (
            <LoadingBlock className="p-5" />
          ) : !summary.data?.byModel.length ? (
            <EmptyState title="No model usage yet" description="Usage appears here after your first request." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Model</Th>
                  <Th className="text-right">Requests</Th>
                  <Th className="text-right">Error rate</Th>
                  <Th className="text-right">Tokens</Th>
                  <Th className="text-right">Spend</Th>
                  <Th className="text-right">Savings</Th>
                </tr>
              </thead>
              <tbody>
                {summary.data.byModel.map((m) => {
                  const s = m.baselineUsd - m.costUsd;
                  return (
                    <tr key={m.modelId}>
                      <Td>
                        <button type="button" className="text-left font-mono text-xs text-brand-700 hover:underline dark:text-brand-300" onClick={() => update({ modelId: m.modelId })}>
                          {m.modelId}
                        </button>
                      </Td>
                      <Td className="num text-right">{formatNumber(m.requests)}</Td>
                      <Td className={cn('num text-right', m.failures > 0 && 'text-red-600 dark:text-red-400')}>{formatRatio(m.requests ? m.failures / m.requests : null)}</Td>
                      <Td className="num text-right">{formatTokens(m.tokens)}</Td>
                      <Td className="num text-right">{formatUsd(m.costUsd)}</Td>
                      <Td className={cn('num text-right', s > 0 && 'text-emerald-600 dark:text-emerald-400')}>{formatUsd(s)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="By API key" description={`Last ${days} days`} />
          {summary.isLoading ? (
            <LoadingBlock className="p-5" />
          ) : !summary.data?.byKey.length ? (
            <EmptyState
              icon={<KeyRound className="h-5 w-5" aria-hidden />}
              title="No key usage yet"
              description="Create an API key and send a request to see per-key spend."
              action={
                <ButtonLink to="/dashboard/api-keys" size="sm">
                  Manage API keys
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Key</Th>
                  <Th className="text-right">Requests</Th>
                  <Th className="text-right">Failures</Th>
                  <Th className="text-right">Tokens</Th>
                  <Th className="text-right">Spend</Th>
                </tr>
              </thead>
              <tbody>
                {summary.data.byKey.map((k) => (
                  <tr key={k.apiKeyId ?? 'dashboard'}>
                    <Td>
                      {k.apiKeyId ? (
                        <button type="button" className="text-left text-brand-700 hover:underline dark:text-brand-300" onClick={() => update({ apiKeyId: k.apiKeyId ?? undefined })}>
                          {k.name}
                        </button>
                      ) : (
                        <span className="text-muted">{k.name}</span>
                      )}
                    </Td>
                    <Td className="num text-right">{formatNumber(k.requests)}</Td>
                    <Td className={cn('num text-right', k.failures > 0 && 'text-red-600 dark:text-red-400')}>{formatNumber(k.failures)}</Td>
                    <Td className="num text-right">{formatTokens(k.tokens)}</Td>
                    <Td className="num text-right">{formatUsd(k.costUsd)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div ref={logRef} className="scroll-mt-20">
        <RequestLog filters={{ status, source, apiKeyId, modelId }} onStatus={(v) => update({ status: v })} onSource={(v) => update({ source: v })} onOpen={(id) => update({ request: id })} />
      </div>

      <RequestTraceModal requestId={openRequest} onClose={closeTrace} onOpenRequest={switchTrace} />
    </>
  );
}

function CsvExportLink({ days }: { days: number }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const href = `/api/usage/export.csv?days=${days}`;
  // Fetch with the active-org header so team workspaces export their own data, then save the blob.
  const onClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(href, { credentials: 'same-origin', headers: apiHeaders(false) });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexovra-usage-${days}d.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error('Could not export CSV', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <a
      href={href}
      download={`nexovra-usage-${days}d.csv`}
      onClick={onClick}
      aria-busy={busy || undefined}
      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
    >
      <Download className="h-4 w-4" aria-hidden />
      {busy ? 'Exporting…' : `Export CSV (${days}d)`}
    </a>
  );
}

function RequestLog({
  filters,
  onStatus,
  onSource,
  onOpen,
}: {
  filters: { status?: Status; source?: Source; apiKeyId?: string; modelId?: string };
  onStatus: (v: string | undefined) => void;
  onSource: (v: string | undefined) => void;
  onOpen: (id: string) => void;
}) {
  const orgId = useOrgId();
  const query = useInfiniteQuery({
    queryKey: ['usage-requests', orgId, filters],
    queryFn: ({ pageParam }) => api.get<Paginated<InferenceRequestRow>>('/api/usage/requests', { query: { ...filters, cursor: pageParam, limit: 25 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(orgId),
  });
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  return (
    <Card>
      <CardHeader
        title="Request log"
        description="Newest first, across your retention window. Filtered by the key and model selected above."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Quick status filter" className="inline-flex rounded-lg border border-brand-100 p-0.5 dark:border-navy-600">
              {[
                { id: undefined, label: 'All' },
                { id: 'FAILED', label: 'Failures' },
                { id: 'REJECTED', label: 'Rejected' },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={filters.status === o.id}
                  onClick={() => onStatus(o.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium',
                    filters.status === o.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-navy-700',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <span className="flex items-center gap-1.5">
              <ListFilter className="h-4 w-4 text-slate-400" aria-hidden />
              <Select className="!h-8 w-36 !text-xs" value={filters.status ?? ''} onChange={(e) => onStatus(e.target.value || undefined)} aria-label="Status filter">
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
            </span>
            <Select className="!h-8 w-36 !text-xs" value={filters.source ?? ''} onChange={(e) => onSource(e.target.value || undefined)} aria-label="Source filter">
              <option value="">Any source</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {query.isLoading ? (
        <LoadingBlock rows={6} className="p-5" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load requests" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" aria-hidden />}
          title={filters.status || filters.source || filters.apiKeyId || filters.modelId ? 'No requests match these filters' : 'No requests yet'}
          description="Send a request from the Playground or with an API key and it will appear here with its routing trace."
          action={
            <ButtonLink to="/dashboard/playground" size="sm">
              Open playground
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Model</Th>
                <Th>Seller</Th>
                <Th>Key</Th>
                <Th>Source</Th>
                <Th>Status</Th>
                <Th className="text-right">Tokens</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Latency</Th>
                <Th className="text-right">Retries</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RequestRow key={r.id} r={r} onOpen={onOpen} />
              ))}
            </tbody>
          </Table>
          <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-muted">
            <span className="num">
              {rows.length} request{rows.length === 1 ? '' : 's'} shown
            </span>
            {query.hasNextPage ? (
              <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
                Load more
              </Button>
            ) : (
              <span>End of log</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
