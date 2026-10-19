import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/api';
import { Button } from './Button';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-brand-50 dark:bg-navy-700', className)} aria-hidden />;
}

export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-10', i === 0 && 'w-2/3')} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-navy-700 dark:text-brand-300">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load data', className }: { error: unknown; onRetry?: () => void; title?: string; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'warning' | 'danger' | 'success' | 'demo'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles = {
    info: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
    danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
    demo: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'note'} className={cn('rounded-lg border px-4 py-3 text-sm', styles, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(Boolean(title) && 'mt-0.5', 'opacity-90')}>{children}</div>}
    </div>
  );
}

/** Wraps a TanStack Query result with consistent loading / error / empty handling. */
export function QueryState<T>({
  query,
  isEmpty,
  empty,
  loading,
  children,
}: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <>{loading ?? <LoadingBlock />}</>;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children(query.data)}</>;
}
