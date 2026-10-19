import { Fragment, useState } from 'react';
import { ChevronDown, Store } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate, formatMs, formatNumber, formatPercent, formatPricePerM, formatRatio } from '@/lib/format';
import { Badge, DemoBadge, EmptyState, StatusBadge, Table, Td, Th } from '@/components/ui';
import { CAPABILITY_LABEL } from '@/components/marketplace/ModelCard';
import type { ModelDetailResponse } from '@/types/api';
import { blendedDiscountPct } from './filters';

type Offer = ModelDetailResponse['offers'][number];

function ReliabilityDetails({ offer, minSamples, windowDays }: { offer: Offer; minSamples: number; windowDays: number }) {
  const r = offer.reliability;
  if (!r) {
    return (
      <p>
        Insufficient data: no requests or health checks have been recorded for this offer in the last {windowDays} days. A score appears after at least {minSamples} observations.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p>{r.explanation}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted">Observations</dt>
          <dd className="num font-medium">
            {formatNumber(r.sampleSize)} / {r.windowDays} days
          </dd>
        </div>
        <div>
          <dt className="text-muted">Success rate</dt>
          <dd className="num font-medium">{r.successRate !== null ? formatRatio(r.successRate) : 'Not measured'}</dd>
        </div>
        <div>
          <dt className="text-muted">95% lower bound</dt>
          <dd className="num font-medium">{r.successRateLowerBound !== null ? formatRatio(r.successRateLowerBound) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Latency component</dt>
          <dd className="num font-medium">{r.latencyComponent !== null ? formatRatio(r.latencyComponent, 0) : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function OffersTable({
  offers,
  baseline,
  minSamples,
  windowDays,
}: {
  offers: Offer[];
  baseline: { inputPerM: number; outputPerM: number } | null;
  minSamples: number;
  windowDays: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!offers.length) {
    return (
      <EmptyState
        icon={<Store className="h-5 w-5" aria-hidden />}
        title="No validated offers for this model yet"
        description="Requests can't be routed to this model until a seller lists an offer that passes endpoint validation."
      />
    );
  }

  return (
    <Table className="[&_table]:min-w-[1180px]">
      <caption className="sr-only">Validated marketplace offers, sorted by blended price</caption>
      <thead>
        <tr>
          <Th>Seller</Th>
          <Th className="text-right">Input / 1M</Th>
          <Th className="text-right">Output / 1M</Th>
          <Th className="text-right">vs. baseline</Th>
          <Th>Health</Th>
          <Th>Verified</Th>
          <Th className="text-right">p50</Th>
          <Th className="text-right">p95</Th>
          <Th className="text-right">Success</Th>
          <Th>Reliability</Th>
          <Th className="text-right">Limits</Th>
          <Th>Validated</Th>
        </tr>
      </thead>
      <tbody>
        {offers.map((o) => {
          const discount = blendedDiscountPct(o, baseline);
          const open = expanded === o.id;
          const panelId = `reliability-${o.id}`;
          const score = o.reliability?.score ?? null;
          return (
            <Fragment key={o.id}>
              <tr className={cn(open && 'bg-brand-50/40 dark:bg-navy-700/30')}>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-900 dark:text-white">{o.seller.name}</span>
                    {o.isDemo && <DemoBadge label="Demo" />}
                  </div>
                  <span className="text-xs text-muted">{o.adapter}</span>
                </Td>
                <Td className="num whitespace-nowrap text-right font-medium text-slate-900 dark:text-white">{formatPricePerM(o.inputPerM)}</Td>
                <Td className="num whitespace-nowrap text-right font-medium text-slate-900 dark:text-white">{formatPricePerM(o.outputPerM)}</Td>
                <Td className="num whitespace-nowrap text-right">
                  {discount === null ? (
                    <span className="text-muted">—</span>
                  ) : discount > 0 ? (
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">−{formatPercent(discount, 1)}</span>
                  ) : (
                    <span className="text-slate-500">+{formatPercent(Math.abs(discount), 1)}</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  <StatusBadge status={o.healthStatus} label={o.healthStatus === 'UNKNOWN' ? 'Not yet checked' : undefined} />
                </Td>
                <Td>
                  {o.verifiedCapabilities.length ? (
                    <div className="flex max-w-[200px] flex-wrap gap-1">
                      {o.verifiedCapabilities.map((c) => (
                        <Badge key={c} tone="brand">
                          {CAPABILITY_LABEL[c] ?? c}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">None verified</span>
                  )}
                </Td>
                <Td className="num whitespace-nowrap text-right">{o.stats?.p50LatencyMs != null ? formatMs(o.stats.p50LatencyMs) : <span className="text-muted">Not measured</span>}</Td>
                <Td className="num whitespace-nowrap text-right">{o.stats?.p95LatencyMs != null ? formatMs(o.stats.p95LatencyMs) : <span className="text-muted">Not measured</span>}</Td>
                <Td className="num whitespace-nowrap text-right">
                  {o.stats?.successRate != null ? (
                    <>
                      {formatRatio(o.stats.successRate)}
                      <span className="block text-xs text-muted">{formatNumber(o.stats.samples)} requests</span>
                    </>
                  ) : (
                    <span className="text-muted">Not measured</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setExpanded(open ? null : o.id)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-brand-50 dark:hover:bg-navy-700"
                  >
                    {score !== null ? <span className="num font-semibold text-slate-900 dark:text-white">{score}/100</span> : <span className="text-muted">Insufficient data</span>}
                    <span className="sr-only">{open ? 'Hide' : 'Show'} reliability explanation</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
                  </button>
                </Td>
                <Td className="num whitespace-nowrap text-right text-xs">
                  <span className="block">{formatNumber(o.maxConcurrency)} concurrent</span>
                  <span className="block text-muted">{formatNumber(o.rpmLimit)} req/min</span>
                </Td>
                <Td className="whitespace-nowrap text-xs">{formatDate(o.validatedAt)}</Td>
              </tr>
              {open && (
                <tr id={panelId}>
                  <td colSpan={12} className="border-b border-brand-50 bg-brand-50/40 px-4 py-3 text-sm text-slate-700 dark:border-navy-700 dark:bg-navy-700/30 dark:text-slate-300">
                    <ReliabilityDetails offer={o} minSamples={minSamples} windowDays={windowDays} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}
