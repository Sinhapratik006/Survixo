import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, CheckCircle2, Circle, DollarSign, Gauge, Server, Wallet } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  QueryState,
  Skeleton,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Th,
  useToast,
} from '@/components/ui';
import { CHART_COLORS, ChartFrame, useChartTheme, useTooltipStyle } from '@/components/charts/theme';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dayLabel, formatDateTime, formatMs, formatNumber, formatRatio, formatRelative, formatUsd } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { useDocumentTitle, useHealthLog, useOffers, useSellerKey } from './shared';
import type { PayoutsResponse, SellerOverview } from './types';

export default function SellerOverviewPage() {
  useDocumentTitle('Seller overview · Nexovra');
  const canView = useCan('seller:view');
  const { orgId, base } = useSellerKey();
  const overview = useQuery({
    queryKey: [...base, 'overview'],
    queryFn: () => api.get<SellerOverview>('/api/sellers/overview'),
    enabled: Boolean(orgId) && canView,
  });
  const offers = useOffers(canView);

  if (!canView)
    return (
      <div>
        <PageHeader title="Seller overview" />
        <Alert tone="warning">Your role in this organization cannot view seller data (requires seller:view).</Alert>
      </div>
    );

  const o = overview.data;
  const totalOffers = o ? Object.values(o.offersByStatus).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seller overview"
        description="Earnings, traffic and health for the inference capacity this organization sells on the marketplace."
        actions={
          <ButtonLink to="/dashboard/sellers/offers" leftIcon={<Server className="h-4 w-4" />}>
            Endpoints & offers
          </ButtonLink>
        }
      />

      {overview.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : overview.error ? (
        <Card>
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
        </Card>
      ) : o ? (
        <>
          <Onboarding endpoints={o.endpoints} totalOffers={totalOffers} validated={(offers.data?.data ?? []).some((x) => x.validatedAt)} active={(o.offersByStatus.ACTIVE ?? 0) > 0} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Seller balance" value={formatUsd(o.sellerBalanceUsd)} icon={<Wallet className="h-4 w-4" />} hint="Available to request as payout" />
            <StatCard label="Pending payouts" value={formatUsd(o.pendingPayoutsUsd)} hint="Requested or processing" />
            <StatCard label="Requests served (30d)" value={formatNumber(o.last30d.requests)} icon={<Activity className="h-4 w-4" />} />
            <StatCard label="Earnings (30d)" value={formatUsd(o.last30d.earningsUsd)} icon={<DollarSign className="h-4 w-4" />} hint={`After the ${(o.platformFeeBps / 100).toFixed(1)}% platform fee`} />
            <StatCard
              label="Error rate (30d)"
              value={formatRatio(o.last30d.errorRate)}
              tone={o.last30d.errorRate === null ? 'default' : o.last30d.errorRate > 0.05 ? 'danger' : o.last30d.errorRate > 0.01 ? 'warning' : 'default'}
              hint={`${formatNumber(o.last30d.attempts)} upstream attempts`}
            />
            <StatCard label="Latency p50 / p95" value={`${formatMs(o.last30d.p50LatencyMs)} / ${formatMs(o.last30d.p95LatencyMs)}`} icon={<Gauge className="h-4 w-4" />} hint="Successful attempts, 30d" />
            <StatCard label="Endpoints" value={formatNumber(o.endpoints)} icon={<Server className="h-4 w-4" />} hint="Not disabled" />
            <StatCard label="Platform fee" value={`${(o.platformFeeBps / 100).toFixed(1)}%`} hint="Deducted from each request's cost" />
          </div>

          <Card>
            <CardHeader title="Offers by status" description={`${totalOffers} offer(s) including archived`} />
            <CardBody className="flex flex-wrap gap-2">
              {totalOffers ? (
                Object.entries(o.offersByStatus).map(([status, n]) => (
                  <span key={status} className="inline-flex items-center gap-1.5">
                    <StatusBadge status={status} />
                    <span className="num text-sm font-medium">{n}</span>
                  </span>
                ))
              ) : (
                <p className="text-sm text-muted">No offers yet.</p>
              )}
            </CardBody>
          </Card>

          <EarningsChart series={o.series} />
        </>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <PayoutsCard balance={o?.sellerBalanceUsd ?? 0} />
        <HealthLogCard />
      </div>
    </div>
  );
}

function Onboarding({ endpoints, totalOffers, validated, active }: { endpoints: number; totalOffers: number; validated: boolean; active: boolean }) {
  const steps = [
    { label: 'Connect an endpoint', detail: 'Add an OpenAI-compatible base URL and API key; we verify it and discover its models.', done: endpoints > 0 },
    { label: 'Create an offer', detail: 'Map a discovered upstream model to a catalog model and set your prices.', done: totalOffers > 0 },
    { label: 'Validate the offer', detail: 'Live test completions confirm the mapping works before any buyer traffic.', done: validated },
    { label: 'Activate', detail: 'Validated offers become eligible for routing.', done: active },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card>
      <CardHeader title="Start selling capacity" description="Four steps to receive routed traffic." actions={<ButtonLink to="/dashboard/sellers/offers" size="sm">Go to endpoints & offers</ButtonLink>} />
      <CardBody>
        <ol className="grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.label} className="flex gap-3">
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-slate-300 dark:text-navy-500" aria-hidden />}
              <div>
                <p className={cn('text-sm font-medium', s.done ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-900 dark:text-white')}>
                  {i + 1}. {s.label}
                  <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function EarningsChart({ series }: { series: SellerOverview['series'] }) {
  const t = useChartTheme();
  const tooltip = useTooltipStyle();
  return (
    <Card>
      <CardHeader title="Earnings & requests (30 days)" description="Successful requests served by your offers per day (UTC) and your earnings after fees." />
      <CardBody>
        {!series.length ? (
          <EmptyState title="No traffic yet" description="Once routed requests are served by your active offers, daily earnings appear here." />
        ) : (
          <ChartFrame height={280} label="Daily requests served and seller earnings over the last 30 days">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(v) => dayLabel(String(v))} stroke={t.axis} tick={{ fill: t.axis, fontSize: 11 }} tickLine={false} />
                <YAxis yAxisId="req" stroke={t.axis} tick={{ fill: t.axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                <YAxis yAxisId="usd" orientation="right" stroke={t.axis} tick={{ fill: t.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} width={60} />
                <Tooltip
                  {...tooltip}
                  labelFormatter={(l) => dayLabel(String(l))}
                  formatter={(value, name) => (name === 'Earnings' ? [formatUsd(Number(value)), name] : [formatNumber(Number(value)), name])}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar yAxisId="req" dataKey="requests" name="Requests" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} maxBarSize={24} />
                <Line yAxisId="usd" type="monotone" dataKey="earningsUsd" name="Earnings" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </CardBody>
    </Card>
  );
}

function PayoutsCard({ balance }: { balance: number }) {
  const canManage = useCan('seller:manage');
  const { orgId, base } = useSellerKey();
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const payouts = useQuery({ queryKey: [...base, 'payouts'], queryFn: () => api.get<PayoutsResponse>('/api/sellers/payouts'), enabled: Boolean(orgId) });

  const amountN = Number(amount);
  const amountError =
    amount.trim() === '' ? undefined : !Number.isFinite(amountN) || amountN < 1 ? 'Minimum payout is $1.00' : amountN > balance ? `Exceeds your seller balance (${formatUsd(balance)})` : undefined;

  const request = useMutation({
    mutationFn: () => api.post('/api/sellers/payouts', { amountUsd: Math.round(amountN * 100) / 100, ...(destination.trim() ? { destination: destination.trim() } : {}) }),
    onSuccess: () => {
      toast.success('Payout requested', 'Funds are reserved until an operator processes the request.');
      setAmount('');
      setDestination('');
      void qc.invalidateQueries({ queryKey: base });
    },
    onError: (err) => toast.error('Payout request failed', errorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!amount.trim() || amountError) return;
    request.mutate();
  };

  return (
    <Card>
      <CardHeader title="Payouts" description="Request a withdrawal of your seller balance." />
      <CardBody className="space-y-4">
        {payouts.data && !payouts.data.payoutProviderConfigured && <Alert tone="warning" title="No payout provider configured">{payouts.data.notice}</Alert>}
        {canManage ? (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-start">
            <Field label="Amount (USD)" error={amountError} hint={`Available: ${formatUsd(balance)}`}>
              {(id, aria) => <Input id={id} {...aria} type="number" min={1} max={balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="num" required />}
            </Field>
            <Field label="Destination label (optional)" hint="A note for the operator, e.g. bank account nickname. No account numbers.">
              {(id, aria) => <Input id={id} {...aria} maxLength={200} value={destination} onChange={(e) => setDestination(e.target.value)} />}
            </Field>
            <Button type="submit" className="sm:mt-[26px]" disabled={!amount.trim() || Boolean(amountError) || balance < 1} loading={request.isPending}>
              Request payout
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">Requesting payouts requires the seller:manage permission.</p>
        )}
      </CardBody>
      <QueryState query={payouts} isEmpty={(d) => !d.data.length} empty={<EmptyState title="No payouts yet" description="Payout requests and their status appear here." className="py-8" />}>
        {(d) => (
          <Table>
            <thead>
              <tr>
                <Th>Requested</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Destination</Th>
                <Th>Processed</Th>
              </tr>
            </thead>
            <tbody>
              {d.data.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(p.createdAt)}</Td>
                  <Td className="num font-medium">{formatUsd(p.amountUsd)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td className="max-w-[200px] truncate" title={p.destination ?? undefined}>
                    {p.destination ?? '-'}
                    {p.note && <p className="text-xs text-muted">{p.note}</p>}
                  </Td>
                  <Td className="whitespace-nowrap">{p.processedAt ? formatDateTime(p.processedAt) : '-'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </QueryState>
    </Card>
  );
}

function HealthLogCard() {
  const log = useHealthLog();
  return (
    <Card>
      <CardHeader title="Health log" description="Latest 100 validation runs and recovery probes across your offers." />
      {log.isLoading ? (
        <CardBody>
          <LoadingBlock />
        </CardBody>
      ) : log.error ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : !log.data?.data.length ? (
        <EmptyState title="No health checks yet" description="Checks are recorded when you validate an offer and when unhealthy offers are probed." />
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Offer</Th>
                <Th>Kind</Th>
                <Th>Result</Th>
                <Th>Latency</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {log.data.data.map((c) => (
                <tr key={c.id}>
                  <Td className="whitespace-nowrap" title={formatDateTime(c.checkedAt)}>
                    {formatRelative(c.checkedAt)}
                  </Td>
                  <Td className="max-w-[180px]">
                    <Link to="/dashboard/sellers/offers" className="block truncate font-medium hover:underline" title={`${c.modelId} → ${c.upstreamModel}`}>
                      {c.modelId}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={c.kind === 'VALIDATION' ? 'brand' : 'neutral'}>{c.kind}</Badge>
                  </Td>
                  <Td>
                    <StatusBadge status={c.ok ? 'SUCCESS' : 'FAILED'} label={c.ok ? 'OK' : `Failed${c.statusCode ? ` (${c.statusCode})` : ''}`} />
                  </Td>
                  <Td className="num">{formatMs(c.latencyMs)}</Td>
                  <Td className="max-w-[240px] truncate text-xs text-muted" title={c.error ?? undefined}>
                    {c.error ?? '-'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}
