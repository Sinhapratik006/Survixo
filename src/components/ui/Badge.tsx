import type { HTMLAttributes } from 'react';
import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'cyan' | 'success' | 'warning' | 'danger' | 'demo';

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-navy-700 dark:text-slate-300 dark:ring-navy-500',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/60 dark:text-brand-200 dark:ring-brand-800',
  cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-200 dark:ring-cyan-800',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800',
  danger: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800',
  demo: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-800',
};

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)} {...props} />;
}

/** Marks illustrative/demo data. Always use it next to non-live values. */
export function DemoBadge({ label = 'Demo data', title, className }: { label?: string; title?: string; className?: string }) {
  return (
    <Badge tone="demo" className={className} title={title ?? 'Illustrative demo data - not live market data'}>
      <FlaskConical className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  HEALTHY: 'success',
  ACTIVE: 'success',
  SUCCESS: 'success',
  VERIFIED: 'success',
  PAID: 'success',
  COMPLETED: 'success',
  operational: 'success',
  active: 'success',
  UNHEALTHY: 'danger',
  FAILED: 'danger',
  REJECTED: 'warning',
  SUSPENDED: 'danger',
  outage: 'danger',
  revoked: 'danger',
  expired: 'warning',
  degraded: 'warning',
  PAUSED: 'warning',
  PENDING: 'warning',
  REQUESTED: 'warning',
  PROCESSING: 'cyan',
  IN_PROGRESS: 'cyan',
  DRAFT: 'neutral',
  UNKNOWN: 'neutral',
  unknown: 'neutral',
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const dot = { success: 'bg-emerald-500', danger: 'bg-red-500', warning: 'bg-amber-500', cyan: 'bg-cyan-500' }[tone as string] ?? 'bg-slate-400';
  return (
    <Badge tone={tone} className={className}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
      {label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
