import { Badge, DemoBadge, StatusBadge, Td } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMs, formatNumber, formatRelative, formatUsd } from '@/lib/format';
import type { InferenceRequestRow } from '@/types/api';

/** One clickable request-log row; `compact` hides seller/key/source/retries (dashboard widget). */
export function RequestRow({ r, onOpen, compact }: { r: InferenceRequestRow; onOpen: (id: string) => void; compact?: boolean }) {
  return (
    <tr className="cursor-pointer transition-colors hover:bg-brand-50/50 dark:hover:bg-navy-700/40" onClick={() => onOpen(r.id)}>
      <Td className="whitespace-nowrap">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(r.id);
          }}
          className="text-left text-brand-700 hover:underline dark:text-brand-300"
          title={formatDateTime(r.createdAt)}
          aria-label={`Open trace for request ${r.id}`}
        >
          {formatRelative(r.createdAt)}
        </button>
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs">{r.modelId ?? r.requestedModel}</span>
          {r.isDemo && <DemoBadge label="Demo" />}
        </div>
      </Td>
      {!compact && <Td className="whitespace-nowrap">{r.seller ?? '—'}</Td>}
      {!compact && <Td className="whitespace-nowrap">{r.apiKeyName ?? <span className="text-muted">{r.apiKeyId ? 'Deleted key' : 'Dashboard'}</span>}</Td>}
      {!compact && (
        <Td>
          <Badge>{r.source.toLowerCase()}</Badge>
        </Td>
      )}
      <Td>
        <StatusBadge status={r.status} />
      </Td>
      <Td className="num whitespace-nowrap text-right">
        {formatNumber(r.inputTokens + r.outputTokens)}
        {r.usageEstimated && (
          <Badge tone="warning" className="ml-1" title="Provider did not report usage; tokens were estimated">
            est.
          </Badge>
        )}
      </Td>
      <Td className="num text-right">{formatUsd(r.costUsd)}</Td>
      <Td className="num text-right">{formatMs(r.latencyMs)}</Td>
      {!compact && <Td className={cn('num text-right', r.retryCount > 0 && 'text-amber-600')}>{r.retryCount}</Td>}
    </tr>
  );
}
