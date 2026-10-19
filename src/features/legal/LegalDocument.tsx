import { useEffect, type ReactNode } from 'react';
import { Alert } from '@/components/ui';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Shared layout for template legal pages: title, counsel notice, table of contents and sections. */
export function LegalDocument({ title, docTitle, intro, sections }: { title: string; docTitle: string; intro: ReactNode; sections: LegalSection[] }) {
  useEffect(() => {
    document.title = `${docTitle} · Nexovra`;
  }, [docTitle]);

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-5xl">
        <Alert tone="warning" title="Template — review with counsel before launch.">
          This document describes how the software currently behaves. It has not been reviewed by a lawyer and is not legal advice. The operator must complete party names, jurisdiction and contact
          details before publishing.
        </Alert>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-muted">Effective date: to be set by the operator at launch.</p>

        <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">On this page</p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-slate-600 hover:text-brand-700 dark:text-slate-400 dark:hover:text-white">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="prose-docs min-w-0 [&>section:first-of-type>h2]:mt-0">
            <div className="mb-6 leading-7 text-slate-600 dark:text-slate-300">{intro}</div>
            {sections.map((s) => (
              <section key={s.id} aria-labelledby={s.id}>
                <h2 id={s.id}>{s.title}</h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  );
}
