import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus, Save, Trash2 } from 'lucide-react';
import { formatDate, formatMs, formatPercent, formatPricePerM, formatRatio, formatTokens, formatUsd } from '@/lib/format';
import { Badge, Button, DemoBadge, EmptyState, ErrorState, Input, Label, LoadingBlock, Modal, StatusBadge, Table, Td, Th } from '@/components/ui';
import { CAPABILITY_LABEL } from '@/components/marketplace/ModelCard';
import { splitTokens, tokenCost } from '@/features/calculator/calc';
import type { CatalogModel } from '@/types/api';
import { MAX_COMPARE, isDemoModel } from './filters';
import { useSavedComparisons, type SavedComparison } from './useSavedComparisons';

const CAP_ORDER = Object.keys(CAPABILITY_LABEL);

function capabilityUnion(models: CatalogModel[]): string[] {
  const all = new Set(models.flatMap((m) => m.capabilities.map((c) => c.capability)));
  return [...all].sort((a, b) => {
    const ia = CAP_ORDER.indexOf(a);
    const ib = CAP_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted">{children}</span>;
}

function Row({ label, hint, models, render }: { label: ReactNode; hint?: ReactNode; models: CatalogModel[]; render: (m: CatalogModel) => ReactNode }) {
  return (
    <tr>
      <Th scope="row" className="whitespace-normal bg-transparent text-left normal-case tracking-normal dark:bg-transparent">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        {hint && <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span>}
      </Th>
      {models.map((m) => (
        <Td key={m.id} className="num align-top">
          {render(m)}
        </Td>
      ))}
    </tr>
  );
}

export function ComparisonTable({ models, monthlyTokensM, inputShare }: { models: CatalogModel[]; monthlyTokensM: number; inputShare: number }) {
  const caps = capabilityUnion(models);
  const { inputTokens, outputTokens } = splitTokens(monthlyTokensM * 1_000_000, inputShare / 100);
  const costs = new Map(models.map((m) => [m.id, m.bestOffer ? tokenCost(inputTokens, outputTokens, m.bestOffer.inputPerM, m.bestOffer.outputPerM) : null]));
  const priced = [...costs.values()].filter((v): v is number => v !== null);
  const lowest = priced.length > 1 ? Math.min(...priced) : null;

  return (
    <Table className="-mx-5 [&_table]:min-w-[560px]">
      <caption className="sr-only">Side-by-side comparison of selected models</caption>
      <thead>
        <tr>
          <Th>
            <span className="sr-only">Attribute</span>
          </Th>
          {models.map((m) => (
            <Th key={m.id} className="min-w-[160px] whitespace-normal normal-case tracking-normal">
              <Link to={`/models/${encodeURIComponent(m.id)}`} className="block text-sm font-semibold text-slate-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300">
                {m.name}
              </Link>
              <span className="block text-xs font-normal text-muted">{m.provider.name}</span>
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        <Row label="Input price" hint="Best offer, per 1M tokens" models={models} render={(m) => (m.bestOffer ? formatPricePerM(m.bestOffer.inputPerM) : <Muted>No live offer</Muted>)} />
        <Row label="Output price" hint="Best offer, per 1M tokens" models={models} render={(m) => (m.bestOffer ? formatPricePerM(m.bestOffer.outputPerM) : <Muted>No live offer</Muted>)} />
        <Row
          label="Baseline prices"
          hint="Reference in / out, per 1M"
          models={models}
          render={(m) => (m.baseline ? `${formatPricePerM(m.baseline.inputPerM)} / ${formatPricePerM(m.baseline.outputPerM)}` : <Muted>No baseline</Muted>)}
        />
        <Row
          label="Discount"
          hint="Blended 3:1 vs. baseline"
          models={models}
          render={(m) =>
            m.bestOffer?.discountPct != null ? (
              <span className={m.bestOffer.discountPct > 0 ? 'font-medium text-emerald-600 dark:text-emerald-400' : undefined}>
                {m.bestOffer.discountPct > 0 ? `${formatPercent(m.bestOffer.discountPct, 0)} below` : `${formatPercent(Math.abs(m.bestOffer.discountPct), 0)} above`}
              </span>
            ) : (
              <Muted>—</Muted>
            )
          }
        />
        <Row
          label="Estimated monthly cost"
          hint={`${formatTokens(inputTokens)} in · ${formatTokens(outputTokens)} out`}
          models={models}
          render={(m) => {
            const cost = costs.get(m.id) ?? null;
            if (cost === null) return <Muted>No live offer</Muted>;
            const baseline = m.baseline ? tokenCost(inputTokens, outputTokens, m.baseline.inputPerM, m.baseline.outputPerM) : null;
            return (
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">{formatUsd(cost)}</span>
                {lowest !== null && cost === lowest && (
                  <Badge tone="cyan" className="ml-1.5">
                    Lowest
                  </Badge>
                )}
                {baseline !== null && <span className="mt-0.5 block text-xs text-muted">{formatUsd(baseline)} at baseline</span>}
              </div>
            );
          }}
        />
        <Row label="Context window" models={models} render={(m) => (m.contextWindow ? `${formatTokens(m.contextWindow)} tokens` : <Muted>Unknown</Muted>)} />
        <Row label="Max output" models={models} render={(m) => (m.maxOutputTokens ? `${formatTokens(m.maxOutputTokens)} tokens` : <Muted>Unknown</Muted>)} />
        {caps.map((cap) => (
          <Row
            key={cap}
            label={CAPABILITY_LABEL[cap] ?? cap}
            models={models}
            render={(m) => {
              const c = m.capabilities.find((x) => x.capability === cap);
              return c ? (
                <span className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200" title={c.status === 'verified' ? 'Verified by Nexovra' : 'Declared in catalog'}>
                  <Check className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden />
                  <span className="sr-only">Supported</span>
                  <span className="text-xs text-muted">{c.status === 'verified' ? 'verified' : 'declared'}</span>
                </span>
              ) : (
                <span className="text-slate-400">
                  <Minus className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Not supported</span>
                </span>
              );
            }}
          />
        ))}
        <Row label="Median latency" hint="p50, fastest offer" models={models} render={(m) => (m.p50LatencyMs !== null ? formatMs(m.p50LatencyMs) : <Muted>Not measured</Muted>)} />
        <Row
          label="Availability"
          hint="Routable offers · success rate"
          models={models}
          render={(m) => (
            <div className="space-y-1">
              {m.offerCount > 0 ? <StatusBadge status={m.healthyOfferCount ? 'HEALTHY' : 'UNHEALTHY'} label={`${m.healthyOfferCount}/${m.offerCount} available`} /> : <Badge>No offers</Badge>}
              <span className="block text-xs text-muted">{m.successRate !== null ? `${formatRatio(m.successRate)} success` : 'Success rate not measured'}</span>
            </div>
          )}
        />
        <Row
          label="Reliability score"
          hint="Best offer, 0–100"
          models={models}
          render={(m) =>
            !m.bestOffer ? <Muted>No live offer</Muted> : m.bestOffer.reliabilityScore !== null ? <span className="font-medium">{m.bestOffer.reliabilityScore}/100</span> : <Muted>Insufficient data</Muted>
          }
        />
        <Row label="Quality score" hint="Mean of public benchmarks" models={models} render={(m) => (m.qualityScore !== null ? formatRatio(m.qualityScore) : <Muted>Not measured</Muted>)} />
        <Row label="Data" models={models} render={(m) => (isDemoModel(m) ? <DemoBadge label="Demo" /> : <Badge tone="neutral">Live catalog</Badge>)} />
      </tbody>
    </Table>
  );
}

export function SavedComparisonsList({ onLoad, catalog }: { onLoad: (c: SavedComparison) => void; catalog: Map<string, CatalogModel> }) {
  const { list, remove } = useSavedComparisons(true);
  if (list.isLoading) return <LoadingBlock rows={2} />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => list.refetch()} title="Could not load saved comparisons" />;
  if (!list.data?.length) return <EmptyState title="No saved comparisons yet" description="Select 2–4 models, open the comparison and save it to find it here later." className="py-6" />;
  return (
    <ul className="divide-y divide-brand-50 dark:divide-navy-700">
      {list.data.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{c.name}</p>
            <p className="truncate text-xs text-muted">
              {c.modelIds.map((id) => catalog.get(id)?.name ?? id).join(' · ')} · saved {formatDate(c.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => onLoad(c)}>
              Load
            </Button>
            <Button size="icon" variant="ghost" aria-label={`Delete saved comparison ${c.name}`} onClick={() => remove.mutate(c.id)}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ComparePanel({
  open,
  onClose,
  models,
  signedIn,
  catalog,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  models: CatalogModel[];
  signedIn: boolean;
  catalog: Map<string, CatalogModel>;
  onLoad: (c: SavedComparison) => void;
}) {
  const [monthlyTokensM, setMonthlyTokensM] = useState(100);
  const [inputShare, setInputShare] = useState(75);
  const defaultName = useMemo(() => models.map((m) => m.name).join(' vs ').slice(0, 60), [models]);
  const [name, setName] = useState('');
  const { save } = useSavedComparisons(signedIn);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const finalName = (name.trim() || defaultName).slice(0, 60);
    save.mutate({ name: finalName, modelIds: models.map((m) => m.id) }, { onSuccess: () => setName('') });
  };

  const anyDemo = models.some(isDemoModel);

  return (
    <Modal open={open} onClose={onClose} size="xl" title={`Compare ${models.length} models`} description="Prices per 1M tokens. Estimates use each model's best current offer.">
      {models.length < 2 ? (
        <EmptyState title="Select at least two models" description={`Add up to ${MAX_COMPARE} models from the list to compare them side by side.`} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cmp-tokens">Monthly tokens (millions)</Label>
              <Input id="cmp-tokens" type="number" min={0} step={1} value={monthlyTokensM} onChange={(e) => setMonthlyTokensM(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div>
              <Label htmlFor="cmp-share">Input share: {inputShare}%</Label>
              <input id="cmp-share" type="range" min={0} max={100} step={5} value={inputShare} onChange={(e) => setInputShare(Number(e.target.value))} className="mt-3 w-full accent-brand-600" />
            </div>
          </div>
          {anyDemo && <p className="text-xs text-muted">Columns marked Demo use illustrative prices and offers, not live market data.</p>}
          <ComparisonTable models={models} monthlyTokensM={monthlyTokensM} inputShare={inputShare} />
          <p className="text-xs text-muted">Cost = input tokens ÷ 1M × input price + output tokens ÷ 1M × output price. Estimates, not quotes: routing may select a different offer at request time.</p>

          <section aria-labelledby="cmp-save-title" className="border-t border-brand-50 pt-4 dark:border-navy-700">
            <h3 id="cmp-save-title" className="text-sm font-semibold text-slate-900 dark:text-white">
              Saved comparisons
            </h3>
            {signedIn ? (
              <>
                <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <Label htmlFor="cmp-name">Name</Label>
                    <Input id="cmp-name" maxLength={60} placeholder={defaultName} value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <Button type="submit" loading={save.isPending} leftIcon={<Save className="h-4 w-4" aria-hidden />}>
                    Save comparison
                  </Button>
                </form>
                <div className="mt-3">
                  <SavedComparisonsList catalog={catalog} onLoad={onLoad} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                  Sign in
                </Link>{' '}
                to save comparisons to your account. You can always share this view: the selection is part of the page URL.
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
