/**
 * Static, always-rendered explainer block for data-driven pages. Its text is
 * part of the prerendered HTML even while the page's live data is loading, so
 * crawlers and AI answer engines see real content instead of "Loading…".
 */
export default function PageAbout({ title, intro, items = [] }) {
  return (
    <section className="container-page py-12 border-t border-slate-200/60 dark:border-navy-700/30">
      <div className="max-w-3xl">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{title}</h2>
        {intro && <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 mb-6">{intro}</p>}
        <div className="space-y-5">
          {items.map((it) => (
            <div key={it.q}>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{it.q}</h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{it.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
