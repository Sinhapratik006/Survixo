import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, List } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CodeBlock, type CodeSample } from '@/components/ui';
import { useConfig } from '@/hooks/useConfig';

export const EXAMPLE_MODEL = 'llama-3.1-8b-instruct';

export function useDocsTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** Live public configuration with safe fallbacks for docs examples. */
export function useDocsConfig() {
  const { data, isLoading } = useConfig();
  const fallback = typeof window !== 'undefined' ? `${window.location.origin}/v1` : 'http://localhost:5173/v1';
  const apiBaseUrl = (data?.apiBaseUrl || fallback).replace(/\/+$/, '');
  return {
    config: data,
    isLoading,
    apiBaseUrl,
    feeBps: data?.platformFeeBps ?? null,
    feePct: data ? `${(data.platformFeeBps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : null,
    billingMode: data?.billingMode ?? null,
    demoMode: data?.demoMode ?? null,
    googleAuthEnabled: data?.googleAuthEnabled ?? null,
    reliability: data?.reliability ?? { minSamples: 30, windowDays: 7 },
  };
}

export function DocSection({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-brand-100 pb-4 first:border-t-0 dark:border-navy-700">
      <h2 id={`${id}-title`} className="group flex items-center gap-2">
        {title}
        <a
          href={`#${id}`}
          className="text-base font-normal text-brand-400 opacity-0 transition-opacity hover:text-brand-600 focus-visible:opacity-100 group-hover:opacity-100 dark:text-brand-300"
          aria-label={`Link to section: ${title}`}
        >
          #
        </a>
      </h2>
      {lead && <p className="text-[15px]">{lead}</p>}
      {children}
    </section>
  );
}

export function DocTable({ head, rows, caption, minWidth = 560 }: { head: ReactNode[]; rows: ReactNode[][]; caption?: string; minWidth?: number }) {
  return (
    <div className="mb-6 overflow-x-auto rounded-xl border border-brand-100 bg-white dark:border-navy-600 dark:bg-navy-800">
      <table className="!mb-0 w-full text-left text-sm" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-brand-50/60 dark:bg-navy-700/50">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="last:[&>td]:border-b-0">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Code({ samples, code, language, title }: { samples?: CodeSample[]; code?: string; language?: string; title?: string }) {
  return <CodeBlock samples={samples} code={code} language={language} title={title} className="mb-6" />;
}

export function Endpoint({ method, path }: { method: 'GET' | 'POST'; path: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        className={cn(
          'rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold',
          method === 'GET' ? 'bg-brand-50 text-brand-700 dark:bg-navy-700 dark:text-brand-200' : 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200',
        )}
      >
        {method}
      </span>
      <code>{path}</code>
    </span>
  );
}

// ───────────── Table of contents ─────────────

export interface TocGroup {
  title: string;
  items: Array<{ id: string; label: string }>;
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

export function DocsToc({ groups, label = 'Documentation sections' }: { groups: TocGroup[]; label?: string }) {
  const ids = groups.flatMap((g) => g.items.map((i) => i.id));
  const [idsKey] = useState(() => ids);
  const active = useActiveSection(idsKey);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const onNavigate = (id: string) => {
    setOpen(false);
    // Re-clicking the current hash does not change the location, so scroll explicitly.
    if (location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  };

  const list = (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const isActive = active === item.id;
              return (
                <li key={item.id}>
                  <Link
                    to={`#${item.id}`}
                    onClick={() => onNavigate(item.id)}
                    aria-current={isActive ? 'location' : undefined}
                    className={cn(
                      'block rounded-md border-l-2 px-2 py-1 text-sm transition-colors',
                      isActive
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-700 dark:border-brand-400 dark:bg-navy-700 dark:text-white'
                        : 'border-transparent text-slate-600 hover:bg-brand-50/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-navy-800 dark:hover:text-white',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <nav aria-label={label}>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="docs-toc-mobile"
          className="flex w-full items-center justify-between rounded-xl border border-brand-100 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200"
        >
          <span className="inline-flex items-center gap-2">
            <List className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden />
            On this page
          </span>
          <ChevronDown className={cn('h-4 w-4', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <div id="docs-toc-mobile" className="mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-brand-100 bg-white p-3 dark:border-navy-600 dark:bg-navy-800">
            {list}
          </div>
        )}
      </div>
      <div className="hidden max-h-[calc(100vh-7rem)] overflow-y-auto pb-6 pr-1 lg:block">{list}</div>
    </nav>
  );
}
