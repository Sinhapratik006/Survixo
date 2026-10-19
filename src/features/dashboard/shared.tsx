import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useActiveOrg } from '@/features/auth/useSession';
import type { OrgRole, Permission } from '@/types/api';

/** Shared helpers for the buyer dashboard pages (dashboard, keys, usage, billing, routing, alerts). */

export function useOrgId(): string | null {
  return useActiveOrg()?.id ?? null;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Nexovra`;
  }, [title]);
}

export interface OrgProject {
  id: string;
  name: string;
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  routingPolicy: { id: string; name: string } | null;
  activeKeys: number;
  createdAt: string;
}

export interface OrgCurrentResponse {
  org: { id: string; name: string; slug: string; personal: boolean; promptRetention: string; requestLogRetentionDays: number; createdAt: string };
  role: OrgRole;
  permissions: Permission[];
  members: Array<{ userId: string; email: string; name: string | null; avatarUrl: string | null; role: OrgRole; joinedAt: string }>;
  projects: OrgProject[];
}

/** Projects of the active organization (for project selectors). */
export function useOrgProjects() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['org-current', orgId],
    queryFn: () => api.get<OrgCurrentResponse>('/api/orgs/current'),
    enabled: Boolean(orgId),
    staleTime: 60_000,
    select: (d) => d.projects,
  });
}

// ───────────── Form helpers (numbers are edited as strings, validated, then converted) ─────────────

export function numberField(opts: { label: string; min?: number; max?: number; int?: boolean; required?: boolean; exclusiveMin?: boolean }) {
  return z.string().trim().superRefine((v, ctx) => {
    if (v === '') {
      if (opts.required) ctx.addIssue({ code: 'custom', message: `${opts.label} is required` });
      return;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid number' });
      return;
    }
    if (opts.int && !Number.isInteger(n)) ctx.addIssue({ code: 'custom', message: 'Enter a whole number' });
    else if (opts.min !== undefined && (opts.exclusiveMin ? n <= opts.min : n < opts.min))
      ctx.addIssue({ code: 'custom', message: `Must be ${opts.exclusiveMin ? 'greater than' : 'at least'} ${opts.min}` });
    else if (opts.max !== undefined && n > opts.max) ctx.addIssue({ code: 'custom', message: `Must be at most ${opts.max.toLocaleString('en-US')}` });
  });
}

export const toNum = (v: string | undefined): number | null => (v === undefined || v.trim() === '' ? null : Number(v));
export const numStr = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

/** "a, b ,c" → ["a","b","c"] (trimmed, de-duplicated). */
export function splitList(v: string): string[] {
  return [...new Set(v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
}

// ───────────── UI helpers ─────────────

export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tone = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-600 dark:bg-brand-400';
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-brand-50 dark:bg-navy-700', className)}
    >
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const DAY_OPTIONS = [7, 30, 90] as const;
export type DayOption = (typeof DAY_OPTIONS)[number];

export function parseDays(v: string | null, fallback: DayOption = 30): DayOption {
  const n = Number(v);
  return (DAY_OPTIONS as readonly number[]).includes(n) ? (n as DayOption) : fallback;
}

/** Segmented 7/30/90-day range selector. */
export function DaysSelector({ value, onChange, label = 'Date range' }: { value: DayOption; onChange: (d: DayOption) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-brand-100 bg-white p-0.5 dark:border-navy-600 dark:bg-navy-800">
      {DAY_OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={cn(
            'num rounded-md px-3 py-1 text-xs font-medium transition-colors',
            value === d ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-navy-700',
          )}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

/** Small inline notice shown when the role lacks a permission. */
export function PermissionNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}
