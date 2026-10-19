import { Link } from 'react-router-dom';
import { GitCompareArrows, Heart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatMs, formatPercent, formatPricePerM, formatTokens } from '@/lib/format';
import { Badge, CopyButton, DemoBadge, StatusBadge, Table, Td, Th } from '@/components/ui';
import type { CatalogModel } from '@/types/api';
import { isDemoModel } from './filters';

export function ModelsTable({
  models,
  favorites,
  onToggleFavorite,
  compare,
  onToggleCompare,
  compareFull,
}: {
  models: CatalogModel[];
  favorites: ReadonlySet<string>;
  onToggleFavorite: (id: string) => void;
  compare: string[];
  onToggleCompare: (id: string) => void;
  compareFull: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <Table className="[&_table]:min-w-[1080px]">
        <caption className="sr-only">Models with best offer and baseline prices per 1M tokens</caption>
        <thead>
          <tr>
            <Th>Model</Th>
            <Th>Provider</Th>
            <Th className="text-right">Best offer in / out</Th>
            <Th className="text-right">Baseline in / out</Th>
            <Th className="text-right">Discount</Th>
            <Th className="text-right">Context</Th>
            <Th className="text-right">p50 latency</Th>
            <Th>Availability</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const selected = compare.includes(m.id);
            const favorite = favorites.has(m.id);
            const offer = m.bestOffer;
            return (
              <tr key={m.id} className={cn('transition-colors hover:bg-brand-50/40 dark:hover:bg-navy-700/30', selected && 'bg-cyan-50/60 dark:bg-cyan-950/20')}>
                <Td className="max-w-[260px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/models/${encodeURIComponent(m.id)}`} className="font-medium text-slate-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300">
                      {m.name}
                    </Link>
                    {isDemoModel(m) && <DemoBadge label="Demo" />}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
                    <code className="truncate text-xs text-muted">{m.id}</code>
                    <CopyButton value={m.id} label={`Copy model ID ${m.id}`} iconOnly className="px-1" />
                  </div>
                </Td>
                <Td className="whitespace-nowrap">{m.provider.name}</Td>
                <Td className="num whitespace-nowrap text-right">
                  {offer ? (
                    <span className="font-medium text-slate-900 dark:text-white">
                      {formatPricePerM(offer.inputPerM)} / {formatPricePerM(offer.outputPerM)}
                    </span>
                  ) : (
                    <span className="text-muted">No live offer</span>
                  )}
                </Td>
                <Td className="num whitespace-nowrap text-right text-slate-500 dark:text-slate-400">
                  {m.baseline ? `${formatPricePerM(m.baseline.inputPerM)} / ${formatPricePerM(m.baseline.outputPerM)}` : '—'}
                </Td>
                <Td className="num whitespace-nowrap text-right">
                  {offer?.discountPct != null ? (
                    <span className={offer.discountPct > 0 ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                      {offer.discountPct > 0 ? '−' : '+'}
                      {formatPercent(Math.abs(offer.discountPct), 0)}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td className="num whitespace-nowrap text-right">{m.contextWindow ? formatTokens(m.contextWindow) : <span className="text-muted">Unknown</span>}</Td>
                <Td className="num whitespace-nowrap text-right">{m.p50LatencyMs !== null ? formatMs(m.p50LatencyMs) : <span className="text-muted">Not measured</span>}</Td>
                <Td className="whitespace-nowrap">
                  {m.offerCount > 0 ? (
                    <StatusBadge status={m.healthyOfferCount ? 'HEALTHY' : 'UNHEALTHY'} label={`${m.healthyOfferCount}/${m.offerCount} available`} />
                  ) : !m.apiSupported ? (
                    <Badge tone="warning">Catalog only</Badge>
                  ) : (
                    <Badge>No offers yet</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(m.id)}
                      aria-pressed={favorite}
                      aria-label={favorite ? `Remove ${m.name} from favorites` : `Add ${m.name} to favorites`}
                      className={cn('rounded-md p-1.5 transition-colors hover:bg-brand-50 dark:hover:bg-navy-700', favorite ? 'text-rose-500' : 'text-slate-400')}
                    >
                      <Heart className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleCompare(m.id)}
                      disabled={compareFull && !selected}
                      aria-pressed={selected}
                      aria-label={selected ? `Remove ${m.name} from comparison` : `Add ${m.name} to comparison`}
                      title={compareFull && !selected ? 'You can compare up to 4 models' : undefined}
                      className={cn('rounded-md p-1.5 transition-colors hover:bg-brand-50 disabled:opacity-40 dark:hover:bg-navy-700', selected ? 'text-cyan-600' : 'text-slate-400')}
                    >
                      <GitCompareArrows className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
