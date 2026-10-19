import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ProviderOption {
  id: string;
  name: string;
  modelCount?: number;
}

/** Multi-select provider filter rendered as a disclosure with checkboxes. */
export function ProviderFilter({ options, value, onChange }: { options: ProviderOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = new Set(value.map((v) => v.toLowerCase()));
  const label = !value.length
    ? 'All providers'
    : value.length === 1
      ? (options.find((o) => o.id.toLowerCase() === value[0]!.toLowerCase())?.name ?? '1 provider')
      : `${value.length} providers`;

  const toggle = (pid: string) => {
    const key = pid.toLowerCase();
    onChange(selected.has(key) ? value.filter((v) => v.toLowerCase() !== key) : [...value, pid]);
  };

  return (
    <div ref={root} className="relative">
      <span id={`${id}-label`} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
        Provider
      </span>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm shadow-sm transition-colors dark:bg-navy-900',
          value.length ? 'border-cyan-400 text-slate-900 dark:text-slate-100' : 'border-brand-100 text-slate-700 dark:border-navy-500 dark:text-slate-200',
        )}
      >
        <span id={`${id}-value`} className="truncate">
          {label}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={`${id}-panel`} className="card absolute left-0 right-0 z-20 mt-1 max-h-72 min-w-[220px] overflow-y-auto p-2 shadow-lift">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted">No providers available.</p>
          ) : (
            <fieldset>
              <legend className="sr-only">Filter by provider</legend>
              {options.map((o) => {
                const checked = selected.has(o.id.toLowerCase());
                return (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-brand-50 dark:hover:bg-navy-700">
                    <input type="checkbox" checked={checked} onChange={() => toggle(o.id)} className="h-4 w-4 rounded border-brand-200 accent-brand-600" />
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{o.name}</span>
                    {o.modelCount !== undefined && <span className="num text-xs text-muted">{o.modelCount}</span>}
                  </label>
                );
              })}
            </fieldset>
          )}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-navy-700">
              Clear provider filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
