import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Info, Send, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMs, formatPercent, formatPricePerM } from '@/lib/format';
import { Badge, Card, DemoBadge, EmptyState, ErrorState, Label, Select, Skeleton } from '@/components/ui';
import type { ModelDetailResponse, ModelsResponse } from '@/types/api';

type Mode = 'lowest_cost' | 'balanced';
type Offer = ModelDetailResponse['offers'][number];

const LATENCY_STEPS: Array<number | null> = [250, 500, 750, 1000, 1500, 2000, 3000, 5000, null];
const MAX_VISIBLE = 6;

const blended = (input: number, output: number) => input * 0.75 + output * 0.25;

interface Evaluated {
  offer: Offer;
  price: number;
  discount: number | null;
  latency: number | null;
  reasons: string[];
  rank: number | null;
}

function normalize(values: Array<number | null>, unknown: number): number[] {
  const known = values.filter((v): v is number => v !== null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  return values.map((v) => (v === null ? unknown : max === min ? 0 : (v - min) / (max - min)));
}

/** Client-side mirror of the server's eligibility + ranking rules, for illustration only. */
function evaluate(detail: ModelDetailResponse, mode: Mode, maxLatency: number | null, minDiscount: number): Evaluated[] {
  const base = detail.model.baseline ? blended(detail.model.baseline.inputPerM, detail.model.baseline.outputPerM) : null;
  const rows: Evaluated[] = detail.offers.map((offer) => {
    const price = blended(offer.inputPerM, offer.outputPerM);
    const discount = base ? (1 - price / base) * 100 : null;
    const latency = offer.stats?.p50LatencyMs ?? null;
    const reasons: string[] = [];
    if (offer.healthStatus === 'UNHEALTHY') reasons.push('Unhealthy — waiting for a recovery probe');
    if (maxLatency !== null) {
      if (latency === null) reasons.push('No latency measurements yet');
      else if (latency > maxLatency) reasons.push(`Median latency ${formatMs(latency)} exceeds ${formatMs(maxLatency)}`);
    }
    if (minDiscount > 0) {
      if (discount === null) reasons.push('No baseline price to verify the discount');
      else if (discount < minDiscount) reasons.push(`Discount ${formatPercent(discount)} is below the ${minDiscount}% minimum`);
    }
    return { offer, price, discount, latency, reasons, rank: null };
  });

  const eligible = rows.filter((r) => !r.reasons.length);
  const costs = normalize(eligible.map((r) => r.price), 1);
  const lats = normalize(eligible.map((r) => r.latency), 0.75);
  const scored = eligible.map((r, i) => ({ r, score: mode === 'lowest_cost' ? r.price : 0.6 * costs[i]! + 0.4 * lats[i]! }));
  scored.sort((a, b) => a.score - b.score || (a.r.latency ?? Number.MAX_SAFE_INTEGER) - (b.r.latency ?? Number.MAX_SAFE_INTEGER) || a.r.offer.id.localeCompare(b.r.offer.id));
  scored.forEach((s, i) => (s.r.rank = i + 1));

  return [...rows].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.price - b.price);
}

function Segmented({ value, onChange, labelledBy }: { value: Mode; onChange: (m: Mode) => void; labelledBy: string }) {
  const options: Array<[Mode, string]> = [
    ['lowest_cost', 'Lowest cost'],
    ['balanced', 'Balanced'],
  ];
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-2 rounded-lg border border-brand-100 bg-brand-50/60 p-0.5 dark:border-navy-600 dark:bg-navy-900">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'h-9 rounded-md px-3 text-sm font-medium transition-colors',
            value === id ? 'bg-white text-brand-700 shadow-sm ring-1 ring-cyan-300 dark:bg-navy-700 dark:text-white dark:ring-cyan-700' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function OfferRow({ row, selected }: { row: Evaluated; selected: boolean }) {
  const rejected = row.reasons.length > 0;
  return (
    <li className="relative">
      <span
        aria-hidden
        className={cn(
          'absolute -left-5 top-1/2 w-5 border-t-2 transition-colors',
          selected ? 'border-cyan-500' : rejected ? 'border-dashed border-slate-300 dark:border-navy-500' : 'border-dashed border-brand-300 dark:border-brand-700',
        )}
      />
      <div
        className={cn(
          'rounded-lg border px-3 py-2.5 transition-colors duration-200',
          selected
            ? 'border-cyan-400 bg-cyan-50/70 ring-1 ring-cyan-300 dark:border-cyan-600 dark:bg-cyan-950/30 dark:ring-cyan-800'
            : rejected
              ? 'border-slate-200 bg-slate-50/70 dark:border-navy-600 dark:bg-navy-900/40'
              : 'border-brand-100 bg-white dark:border-navy-600 dark:bg-navy-800',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            {rejected ? (
              <XCircle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            ) : (
              <CheckCircle2 className={cn('h-4 w-4 shrink-0', selected ? 'text-cyan-600 dark:text-cyan-400' : 'text-brand-500 dark:text-brand-300')} aria-hidden />
            )}
            <span className={cn('truncate text-sm font-medium', rejected ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white')}>{row.offer.seller.name}</span>
            {row.offer.isDemo && <DemoBadge label="Demo" />}
          </div>
          <div className="flex items-center gap-2">
            {selected ? (
              <Badge tone="cyan">Would be selected</Badge>
            ) : rejected ? (
              <Badge>Rejected</Badge>
            ) : (
              <Badge tone="brand">Eligible · #{row.rank}</Badge>
            )}
          </div>
        </div>
        <dl className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
          <div className="flex gap-1">
            <dt>Blended</dt>
            <dd className="font-medium text-slate-700 dark:text-slate-200">{formatPricePerM(row.price)}/1M</dd>
          </div>
          <div className="flex gap-1">
            <dt>Median latency</dt>
            <dd className="font-medium text-slate-700 dark:text-slate-200">{row.latency !== null ? formatMs(row.latency) : 'not measured'}</dd>
          </div>
          {row.discount !== null && (
            <div className="flex gap-1">
              <dt>vs baseline</dt>
              <dd className={cn('font-medium', row.discount > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200')}>
                {row.discount >= 0 ? `−${formatPercent(row.discount, 0)}` : `+${formatPercent(-row.discount, 0)}`}
              </dd>
            </div>
          )}
        </dl>
        {rejected && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{row.reasons.join(' · ')}</p>}
      </div>
    </li>
  );
}

export function RoutingVisual() {
  const ids = { model: useId(), mode: useId(), latency: useId(), discount: useId() };
  const models = useQuery({ queryKey: ['models', 'popularity'], queryFn: () => api.get<ModelsResponse>('/api/models', { query: { sort: 'popularity' } }) });
  const routable = useMemo(() => (models.data?.data ?? []).filter((m) => m.apiSupported && m.bestOffer), [models.data]);

  const [modelId, setModelId] = useState('');
  const [mode, setMode] = useState<Mode>('lowest_cost');
  const [latencyIdx, setLatencyIdx] = useState(LATENCY_STEPS.length - 1);
  const [minDiscount, setMinDiscount] = useState(0);

  useEffect(() => {
    if (routable.length && !routable.some((m) => m.id === modelId)) setModelId(routable[0]!.id);
  }, [routable, modelId]);

  const detail = useQuery({
    queryKey: ['home', 'routing-visual', modelId],
    queryFn: () => api.get<ModelDetailResponse>(`/api/models/${encodeURIComponent(modelId)}`),
    enabled: Boolean(modelId),
  });

  const maxLatency = LATENCY_STEPS[latencyIdx] ?? null;
  const rows = useMemo(() => (detail.data ? evaluate(detail.data, mode, maxLatency, minDiscount) : []), [detail.data, mode, maxLatency, minDiscount]);
  const selected = rows.find((r) => r.rank === 1);
  const eligibleCount = rows.filter((r) => r.rank !== null).length;
  const visible = rows.slice(0, MAX_VISIBLE);
  const demo = rows.some((r) => r.offer.isDemo) || Boolean(detail.data?.model.isDemo);

  let body: ReactNode;
  if (models.isLoading) {
    body = (
      <div className="space-y-3 p-5" role="status" aria-label="Loading offers">
        <Skeleton className="h-10" />
        <Skeleton className="h-16" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  } else if (models.error) {
    body = <ErrorState error={models.error} onRetry={() => models.refetch()} />;
  } else if (!routable.length) {
    body = (
      <EmptyState
        title="No live offers to route yet"
        description="Once sellers publish validated offers, this panel shows how a request would be routed between them."
        action={
          <Link to="/models" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
            Browse the catalog
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={ids.model}>Model</Label>
            <Select id={ids.model} value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {routable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p id={ids.mode} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Routing mode
            </p>
            <Segmented value={mode} onChange={setMode} labelledBy={ids.mode} />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={ids.latency} className="mb-0">
                Max median latency
              </Label>
              <span className="num text-xs font-medium text-slate-700 dark:text-slate-300">{maxLatency === null ? 'No limit' : formatMs(maxLatency)}</span>
            </div>
            <input
              id={ids.latency}
              type="range"
              min={0}
              max={LATENCY_STEPS.length - 1}
              step={1}
              value={latencyIdx}
              aria-valuetext={maxLatency === null ? 'No limit' : formatMs(maxLatency)}
              onChange={(e) => setLatencyIdx(Number(e.target.value))}
              className="mt-2 w-full accent-brand-600"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={ids.discount} className="mb-0">
                Minimum discount
              </Label>
              <span className="num text-xs font-medium text-slate-700 dark:text-slate-300">{minDiscount === 0 ? 'None' : `${minDiscount}% below baseline`}</span>
            </div>
            <input
              id={ids.discount}
              type="range"
              min={0}
              max={80}
              step={5}
              value={minDiscount}
              aria-valuetext={minDiscount === 0 ? 'No minimum' : `${minDiscount} percent`}
              onChange={(e) => setMinDiscount(Number(e.target.value))}
              className="mt-2 w-full accent-brand-600"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-2.5 dark:border-brand-800 dark:bg-brand-950/40">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white">
              <Send className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-900 dark:text-white">
                POST /v1/chat/completions <span className="font-normal text-muted">·</span> <code className="text-xs">{modelId}</code>
              </p>
              <p className="truncate text-xs text-muted">
                {mode === 'lowest_cost' ? 'Lowest estimated cost' : 'Balanced cost and latency'}
                {maxLatency !== null && ` · ≤ ${formatMs(maxLatency)}`}
                {minDiscount > 0 && ` · ≥ ${minDiscount}% discount`}
              </p>
            </div>
          </div>

          {detail.isLoading ? (
            <div className="mt-4 space-y-2 pl-8" role="status" aria-label="Loading offers">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : detail.error ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} title="Could not load offers" />
          ) : !rows.length ? (
            <EmptyState title="No validated offers for this model" description="Pick another model to see how routing works." />
          ) : (
            <div className="relative ml-4 mt-0 pl-8 pt-4">
              <span aria-hidden className="absolute bottom-7 left-3 top-0 border-l-2 border-brand-200 dark:border-navy-500" />
              <ul className="space-y-2" aria-label="Offers considered for this request">
                {visible.map((row) => (
                  <OfferRow key={row.offer.id} row={row} selected={row === selected} />
                ))}
              </ul>
              {rows.length > MAX_VISIBLE && <p className="mt-2 text-xs text-muted">+{rows.length - MAX_VISIBLE} more offers considered</p>}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <p className="text-sm text-slate-700 dark:text-slate-300" aria-live="polite">
            <span className="font-medium">
              {eligibleCount} of {rows.length} offers eligible.
            </span>{' '}
            {selected ? (
              <>
                {selected.offer.seller.name} would serve this request at {formatPricePerM(selected.price)} per 1M blended tokens
                {selected.discount !== null && selected.discount > 0 && <span className="text-emerald-700 dark:text-emerald-400"> ({formatPercent(selected.discount, 0)} below baseline)</span>}.
              </>
            ) : (
              'No offer meets these constraints — the API would reject the request and explain why.'
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 px-5 py-3 dark:border-navy-600">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Routing preview</h2>
        <div className="flex items-center gap-2">
          {demo && <DemoBadge label="Demo offers" />}
          {modelId && routable.length > 0 && (
            <Link to={`/models/${encodeURIComponent(modelId)}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              All offers <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
      </div>
      {body}
      <p className="flex gap-2 border-t border-brand-100 bg-brand-50/40 px-5 py-2.5 text-xs text-muted dark:border-navy-600 dark:bg-navy-900/40">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Illustration using current offer data — the server makes the final routing decision. Prices are blended at 3 input : 1 output tokens.</span>
      </p>
    </Card>
  );
}
