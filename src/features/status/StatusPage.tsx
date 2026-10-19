import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleHelp, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dayLabel, formatDateTime, formatNumber, formatRatio, formatRelative } from '@/lib/format';
import { Alert, Badge, Button, Card, CardHeader, DemoBadge, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';

type ComponentStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

interface StatusResponse {
  status: ComponentStatus;
  components: Array<{ name: string; status: ComponentStatus | string; detail: string }>;
  incidents: Array<{ id: string; title: string; status: string; impact: string; body: string; startedAt: string; resolvedAt: string | null; updatedAt: string }>;
  uptime: Array<{ day: string; attempts: number; successRate: number | null }>;
  generatedAt: string;
  demoMode: boolean;
}

const OVERALL: Record<string, { title: string; text: string; icon: typeof CheckCircle2; cls: string }> = {
  operational: {
    title: 'All systems operational',
    text: 'Every monitored component is responding normally.',
    icon: CheckCircle2,
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  },
  degraded: {
    title: 'Some systems are degraded',
    text: 'One or more components report reduced performance. Requests may be slower or rerouted.',
    icon: AlertTriangle,
    cls: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
  },
  outage: {
    title: 'Service disruption',
    text: 'At least one component is unavailable. We are working to restore service.',
    icon: AlertOctagon,
    cls: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100',
  },
  unknown: {
    title: 'Status unknown',
    text: 'Not enough data has been recorded to determine the current status.',
    icon: CircleHelp,
    cls: 'border-slate-200 bg-slate-50 text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100',
  },
};

const DAYS = 30;

function dayKeys(): string[] {
  const now = new Date();
  return Array.from({ length: DAYS }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (DAYS - 1 - i))).toISOString().slice(0, 10));
}

function barColor(rate: number | null | undefined) {
  if (rate == null) return 'bg-slate-200 dark:bg-navy-600';
  if (rate >= 0.99) return 'bg-emerald-500';
  if (rate >= 0.95) return 'bg-amber-400';
  return 'bg-red-500';
}

function describeDay(day: string, row: { attempts: number; successRate: number | null } | undefined) {
  if (!row || row.successRate === null || row.attempts === 0) return `${dayLabel(day)}: no data`;
  return `${dayLabel(day)}: ${formatRatio(row.successRate, 2)} of ${formatNumber(row.attempts)} request attempts succeeded`;
}

function UptimeBars({ uptime }: { uptime: StatusResponse['uptime'] }) {
  const days = useMemo(dayKeys, []);
  const byDay = useMemo(() => new Map(uptime.map((u) => [new Date(u.day).toISOString().slice(0, 10), u])), [uptime]);
  const [active, setActive] = useState<string | null>(null);

  const totals = uptime.reduce((acc, u) => (u.successRate === null ? acc : { attempts: acc.attempts + u.attempts, ok: acc.ok + u.successRate * u.attempts }), { attempts: 0, ok: 0 });
  const overall = totals.attempts ? totals.ok / totals.attempts : null;
  const shown = active ?? days[days.length - 1]!;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {overall !== null ? (
            <>
              <span className="num font-semibold text-slate-900 dark:text-white">{formatRatio(overall, 2)}</span> measured success rate over {formatNumber(totals.attempts)} attempts
            </>
          ) : (
            'No request attempts recorded in the last 30 days'
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted" aria-hidden>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> ≥ 99%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> 95–99%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> &lt; 95%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-200 dark:bg-navy-600" /> No data
          </span>
        </div>
      </div>
      <ol className="mt-4 flex h-10 items-stretch gap-[3px]" aria-label="Daily measured request success rate, last 30 days">
        {days.map((d) => {
          const row = byDay.get(d);
          const label = describeDay(d, row);
          return (
            <li key={d} className="flex-1">
              <button
                type="button"
                aria-label={label}
                title={label}
                onMouseEnter={() => setActive(d)}
                onFocus={() => setActive(d)}
                onMouseLeave={() => setActive(null)}
                onBlur={() => setActive(null)}
                className={cn('h-full w-full rounded-sm transition-opacity hover:opacity-80', barColor(row && row.attempts ? row.successRate : null), shown === d && active && 'ring-2 ring-cyan-400 ring-offset-1 dark:ring-offset-navy-800')}
              />
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{dayLabel(days[0]!)}</span>
        <span aria-live="polite" className="text-slate-700 dark:text-slate-300">
          {describeDay(shown, byDay.get(shown))}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const query = useQuery({ queryKey: ['status'], queryFn: () => api.get<StatusResponse>('/api/status'), refetchInterval: 60_000 });
  const data = query.data;

  useEffect(() => {
    document.title = 'Status · Nexovra';
  }, []);

  const overall = data ? (OVERALL[data.status] ?? OVERALL.unknown!) : null;
  const open = data?.incidents.filter((i) => !i.resolvedAt) ?? [];
  const resolved = data?.incidents.filter((i) => i.resolvedAt) ?? [];

  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader
        title="System status"
        description="Live health of the API and marketplace components. This page refreshes every minute."
        badge={data?.demoMode ? <DemoBadge label="Demo mode" /> : undefined}
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()} loading={query.isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
            Refresh
          </Button>
        }
      />

      {query.isLoading ? (
        <Card className="p-6">
          <LoadingBlock rows={6} />
        </Card>
      ) : query.error || !data || !overall ? (
        <Card>
          <ErrorState error={query.error ?? new Error('Status is unavailable')} onRetry={() => query.refetch()} title="Could not load system status" />
        </Card>
      ) : (
        <div className="space-y-6">
          <div role="status" className={cn('flex items-start gap-3 rounded-xl border px-5 py-4', overall.cls)}>
            <overall.icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{overall.title}</p>
              <p className="text-sm opacity-90">{overall.text}</p>
            </div>
            <p className="shrink-0 text-xs opacity-80" title={formatDateTime(data.generatedAt)}>
              Last updated {formatRelative(data.generatedAt)}
            </p>
          </div>

          {data.demoMode && (
            <Alert tone="demo" title="Demo mode">
              This deployment includes demo offers that route to synthetic endpoints, so marketplace and uptime figures may reflect demo traffic rather than production usage.
            </Alert>
          )}

          <Card>
            <CardHeader title="Components" description="Checked each time this page refreshes." />
            <ul className="divide-y divide-brand-50 dark:divide-navy-700">
              {data.components.map((c) => (
                <li key={c.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{c.name}</p>
                    <p className="break-words text-xs text-muted">{c.detail}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Request success, last 30 days" description="Daily share of marketplace request attempts that succeeded (UTC days)." />
            <div className="p-5">
              <UptimeBars uptime={data.uptime} />
              <p className="mt-4 text-xs text-muted">
                Figures reflect measured request attempts to seller endpoints, including attempts that were retried on another offer. They are not a service level agreement.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Incidents" description="Open incidents and those resolved in the last 30 days." />
            {data.incidents.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} title="No incidents reported in the last 30 days" />
            ) : (
              <ul className="divide-y divide-brand-50 dark:divide-navy-700">
                {[...open, ...resolved].map((i) => (
                  <li key={i.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{i.title}</h3>
                      {i.resolvedAt ? <Badge tone="success">Resolved</Badge> : <Badge tone="warning">{i.status || 'Open'}</Badge>}
                      {i.impact && <Badge>Impact: {i.impact}</Badge>}
                    </div>
                    {i.body && <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{i.body}</p>}
                    <p className="mt-1.5 text-xs text-muted">
                      Started {formatDateTime(i.startedAt)}
                      {i.resolvedAt ? ` · Resolved ${formatDateTime(i.resolvedAt)}` : ` · Last update ${formatRelative(i.updatedAt)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
