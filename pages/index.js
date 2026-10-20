export default function HomePage() {
  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-900">
      <div className="container-page py-12">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          AI Inference Marketplace
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          Unified OpenAI-compatible API with intelligent routing, budget guards,
          and a full seller ecosystem.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <a
            href="/models"
            className="group rounded-lg bg-brand-600 px-6 py-3 text-white font-medium hover:bg-brand-700 transition-colors dark:bg-navy-800 dark:hover:bg-navy-700"
          >
            Browse Models
          </a>
          <a
            href="/calculator"
            className="group rounded-lg border border-brand-200 px-6 py-3 text-brand-700 font-medium hover:bg-brand-50 dark:border-navy-600 dark:hover:bg-navy-800 dark:text-slate-100"
          >
            Cost Calculator
          </a>
          <a
            href="/pricing"
            className="group rounded-lg bg-white px-6 py-3 text-slate-900 dark:text-slate-100 font-medium hover:bg-brand-50 dark:hover:bg-navy-800 dark:text-slate-100"
          >
            Pricing
          </a>
          <a
            href="/docs"
            className="group rounded-lg border border-brand-200 px-6 py-3 text-brand-700 font-medium hover:bg-brand-50 dark:border-navy-600 dark:hover:bg-navy-800 dark:text-slate-100"
          >
            Documentation
          </a>
        </div>
      </div>
    </div>
  );
}