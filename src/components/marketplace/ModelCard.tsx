import { Link } from 'react-router-dom';
import { ArrowRight, GitCompareArrows, Heart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatMs, formatPricePerM, formatTokens } from '@/lib/format';
import { Badge, CopyButton, DemoBadge, StatusBadge } from '@/components/ui';
import type { CatalogModel } from '@/types/api';

export const CAPABILITY_LABEL: Record<string, string> = {
  chat: 'Text',
  streaming: 'Streaming',
  tools: 'Tools',
  json_mode: 'JSON mode',
  vision: 'Vision',
  embeddings: 'Embeddings',
  image_generation: 'Image generation',
  audio: 'Audio',
  video: 'Video',
  prompt_caching: 'Prompt caching',
  batch: 'Batch',
};

export function ModelCard({
  model,
  favorite,
  onToggleFavorite,
  compareSelected,
  onToggleCompare,
  compareDisabled,
}: {
  model: CatalogModel;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  compareSelected?: boolean;
  onToggleCompare?: () => void;
  compareDisabled?: boolean;
}) {
  const offer = model.bestOffer;
  const demo = model.isDemo || offer?.isDemo || model.baseline?.isDemo;
  return (
    <article className={cn('card flex flex-col p-5 transition-shadow hover:shadow-lift', compareSelected && 'ring-2 ring-cyan-400')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900 dark:text-white">
            <Link to={`/models/${encodeURIComponent(model.id)}`} className="hover:text-brand-700 dark:hover:text-brand-300">
              {model.name}
            </Link>
          </h3>
          <p className="text-sm text-muted">{model.provider.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-pressed={favorite}
              aria-label={favorite ? `Remove ${model.name} from favorites` : `Add ${model.name} to favorites`}
              className={cn('rounded-md p-1.5 transition-colors hover:bg-brand-50 dark:hover:bg-navy-700', favorite ? 'text-rose-500' : 'text-slate-400')}
            >
              <Heart className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
            </button>
          )}
          {onToggleCompare && (
            <button
              type="button"
              onClick={onToggleCompare}
              disabled={compareDisabled && !compareSelected}
              aria-pressed={compareSelected}
              aria-label={compareSelected ? `Remove ${model.name} from comparison` : `Add ${model.name} to comparison`}
              title={compareDisabled && !compareSelected ? 'You can compare up to 4 models' : undefined}
              className={cn('rounded-md p-1.5 transition-colors hover:bg-brand-50 disabled:opacity-40 dark:hover:bg-navy-700', compareSelected ? 'text-cyan-600' : 'text-slate-400')}
            >
              <GitCompareArrows className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {model.capabilities.slice(0, 5).map((c) => (
          <Badge key={c.capability} tone={c.capability === 'vision' ? 'cyan' : 'brand'} title={c.status === 'verified' ? 'Verified by Nexovra' : 'Declared in catalog'}>
            {CAPABILITY_LABEL[c.capability] ?? c.capability}
          </Badge>
        ))}
        {!model.apiSupported && <Badge tone="warning">Catalog only</Badge>}
        {demo && <DemoBadge label="Demo" />}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Best offer / 1M</dt>
          <dd className="num font-medium text-slate-900 dark:text-white">
            {offer ? (
              <>
                {formatPricePerM(offer.inputPerM)} <span className="text-muted">in</span> · {formatPricePerM(offer.outputPerM)} <span className="text-muted">out</span>
              </>
            ) : (
              <span className="text-muted">No live offer</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Baseline / 1M</dt>
          <dd className="num text-slate-600 dark:text-slate-300">
            {model.baseline ? `${formatPricePerM(model.baseline.inputPerM)} · ${formatPricePerM(model.baseline.outputPerM)}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Context</dt>
          <dd className="num text-slate-700 dark:text-slate-300">{model.contextWindow ? formatTokens(model.contextWindow) : 'Unknown'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Median latency</dt>
          <dd className="num text-slate-700 dark:text-slate-300">{model.p50LatencyMs !== null ? formatMs(model.p50LatencyMs) : 'Not measured'}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {offer?.discountPct != null && offer.discountPct > 0 && (
          <Badge tone="success" title="Blended price vs. baseline (3 input : 1 output tokens)">
            {offer.discountPct.toFixed(0)}% below baseline
          </Badge>
        )}
        {model.offerCount > 0 ? (
          <StatusBadge status={model.healthyOfferCount ? 'HEALTHY' : 'UNHEALTHY'} label={`${model.healthyOfferCount}/${model.offerCount} offers available`} />
        ) : (
          model.apiSupported && <Badge>No offers yet</Badge>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="flex min-w-0 items-center gap-1">
          <code className="truncate text-xs text-muted">{model.id}</code>
          <CopyButton value={model.id} label={`Copy model ID ${model.id}`} iconOnly />
        </span>
        <Link to={`/models/${encodeURIComponent(model.id)}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
          View model <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
