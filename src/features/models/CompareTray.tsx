import { GitCompareArrows, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { CatalogModel } from '@/types/api';
import { MAX_COMPARE } from './filters';

/** Sticky bottom bar listing the models selected for comparison. */
export function CompareTray({
  ids,
  catalog,
  onRemove,
  onClear,
  onCompare,
}: {
  ids: string[];
  catalog: Map<string, CatalogModel>;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: () => void;
}) {
  if (!ids.length) return null;
  return (
    <section aria-label="Comparison tray" className="fixed inset-x-0 bottom-0 z-30 border-t border-cyan-200 bg-white/95 shadow-lift backdrop-blur dark:border-cyan-900 dark:bg-navy-900/95">
      <div className="container-page flex flex-wrap items-center gap-3 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
          <GitCompareArrows className="h-4 w-4 text-cyan-600" aria-hidden />
          <span aria-live="polite">
            {ids.length}/{MAX_COMPARE} selected
          </span>
        </div>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
          {ids.map((id) => {
            const name = catalog.get(id)?.name ?? id;
            return (
              <li key={id} className="inline-flex max-w-[220px] items-center gap-1 rounded-lg bg-cyan-50 py-1 pl-2.5 pr-1 text-xs font-medium text-cyan-900 ring-1 ring-inset ring-cyan-300 dark:bg-cyan-950/50 dark:text-cyan-100 dark:ring-cyan-800">
                <span className="truncate">{name}</span>
                <button type="button" onClick={() => onRemove(id)} aria-label={`Remove ${name} from comparison`} className="rounded p-0.5 hover:bg-cyan-100 dark:hover:bg-cyan-900">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
          <Button size="sm" onClick={onCompare} disabled={ids.length < 2} title={ids.length < 2 ? 'Select at least two models' : undefined}>
            Compare{ids.length >= 2 ? ` ${ids.length}` : ''}
          </Button>
        </div>
      </div>
    </section>
  );
}
