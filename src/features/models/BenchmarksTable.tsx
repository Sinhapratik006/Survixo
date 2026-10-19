import { Fragment, useState } from 'react';
import { ChevronRight, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate, formatMs, formatNumber, formatPercent, formatRatio, formatUsd } from '@/lib/format';
import { DemoBadge, EmptyState, Table, Td, Th } from '@/components/ui';
import type { BenchmarkResult } from '@/types/api';

export function formatBenchmarkScore(b: Pick<BenchmarkResult, 'score' | 'scoreUnit'>): string {
  const unit = b.scoreUnit.toLowerCase();
  if (unit === 'accuracy' || unit === 'fraction' || unit === 'ratio') return formatRatio(b.score);
  if (unit === 'percent' || unit === '%') return formatPercent(b.score);
  return `${formatNumber(b.score, { maximumFractionDigits: 3 })} ${b.scoreUnit}`;
}

export function BenchmarksTable({ results }: { results: BenchmarkResult[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!results.length) {
    return <EmptyState icon={<FlaskConical className="h-5 w-5" aria-hidden />} title="No benchmark results yet — quality has not been measured for this model." />;
  }

  return (
    <Table className="[&_table]:min-w-[820px]">
      <caption className="sr-only">Public benchmark results. Expand a row for dataset, method and limitations.</caption>
      <thead>
        <tr>
          <Th>Benchmark</Th>
          <Th className="text-right">Score</Th>
          <Th className="text-right">Samples</Th>
          <Th className="text-right">Run cost</Th>
          <Th className="text-right">Avg latency</Th>
          <Th>Run date</Th>
        </tr>
      </thead>
      <tbody>
        {results.map((b) => {
          const open = expanded === b.id;
          const panelId = `benchmark-${b.id}`;
          return (
            <Fragment key={b.id}>
              <tr className={cn(open && 'bg-brand-50/40 dark:bg-navy-700/30')}>
                <Td>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setExpanded(open ? null : b.id)}
                    className="inline-flex items-center gap-1.5 rounded-md text-left font-medium text-slate-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300"
                  >
                    <ChevronRight className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')} aria-hidden />
                    <span>
                      {b.benchmark} <span className="font-normal text-muted">v{b.version}</span>
                    </span>
                  </button>
                  {b.isDemo && <DemoBadge label="Demo" className="ml-2" />}
                </Td>
                <Td className="num whitespace-nowrap text-right font-semibold text-slate-900 dark:text-white">{formatBenchmarkScore(b)}</Td>
                <Td className="num whitespace-nowrap text-right">{formatNumber(b.sampleSize)}</Td>
                <Td className="num whitespace-nowrap text-right">{formatUsd(b.costUsd)}</Td>
                <Td className="num whitespace-nowrap text-right">{formatMs(b.avgLatencyMs)}</Td>
                <Td className="whitespace-nowrap">{formatDate(b.runAt)}</Td>
              </tr>
              {open && (
                <tr id={panelId}>
                  <td colSpan={6} className="border-b border-brand-50 bg-brand-50/40 px-4 py-4 dark:border-navy-700 dark:bg-navy-700/30">
                    <dl className="grid gap-4 text-sm md:grid-cols-3">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Dataset</dt>
                        <dd className="mt-1 text-slate-700 dark:text-slate-300">{b.datasetDescription}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Method</dt>
                        <dd className="mt-1 text-slate-700 dark:text-slate-300">{b.method}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Limitations</dt>
                        <dd className="mt-1 text-slate-700 dark:text-slate-300">{b.limitations}</dd>
                      </div>
                    </dl>
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
