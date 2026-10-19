import { useState, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  badge,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  badge?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className="text-brand-500 dark:text-brand-300">{icon}</span>}
      </div>
      <p
        className={cn(
          'num mt-2 text-2xl font-semibold tracking-tight',
          tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warning' && 'text-amber-600',
          tone === 'danger' && 'text-red-600',
          tone === 'default' && 'text-slate-900 dark:text-white',
        )}
      >
        {value}
      </p>
      {(hint || badge) && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          {badge}
          {hint}
        </div>
      )}
    </div>
  );
}

export function PageHeader({ title, description, actions, badge }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn('whitespace-nowrap border-b border-brand-100 bg-brand-50/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-navy-600 dark:bg-navy-700/40 dark:text-slate-400', className)} {...props} />;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-brand-50 px-4 py-3 align-middle text-slate-700 dark:border-navy-700 dark:text-slate-300', className)} {...props} />;
}

export function CopyButton({ value, label = 'Copy', className, iconOnly }: { value: string; label?: string; className?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-navy-700 dark:hover:text-white',
        className,
      )}
      aria-label={copied ? 'Copied' : `${label}${iconOnly ? '' : ''}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {!iconOnly && (copied ? 'Copied' : label)}
    </button>
  );
}

export interface CodeSample {
  label: string;
  language: string;
  code: string;
}

/** Dark code panel with optional language tabs and copy button. */
export function CodeBlock({ samples, code, language = 'bash', className, title }: { samples?: CodeSample[]; code?: string; language?: string; className?: string; title?: string }) {
  const list = samples ?? [{ label: language, language, code: code ?? '' }];
  const [active, setActive] = useState(0);
  const current = list[Math.min(active, list.length - 1)]!;
  return (
    <div className={cn('overflow-hidden rounded-xl border border-navy-600 bg-navy-900 text-slate-100 shadow-card', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-navy-700 bg-navy-800 px-3 py-1.5">
        <div className="flex items-center gap-1" role={list.length > 1 ? 'tablist' : undefined}>
          {title && list.length === 1 && <span className="px-1 text-xs text-slate-400">{title}</span>}
          {list.length > 1 &&
            list.map((s, i) => (
              <button
                key={s.label}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', i === active ? 'bg-navy-600 text-white' : 'text-slate-400 hover:text-white')}
              >
                {s.label}
              </button>
            ))}
          {list.length === 1 && !title && <span className="px-1 text-xs text-slate-400">{current.language}</span>}
        </div>
        <CopyButton value={current.code} className="text-slate-400 hover:bg-navy-700 hover:text-white" />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6">
        <code>{current.code}</code>
      </pre>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ id: T; label: ReactNode }>; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-brand-100 dark:border-navy-600', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            t.id === value ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-slate-800 dark:text-slate-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
