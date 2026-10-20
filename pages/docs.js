export default function DocsPage() {
  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-900">
      <div className="container-page py-12">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Documentation
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          Find guides, API references, and integration help.
        </p>
        <div className="mt-8 space-y-6">
          <nav className="space-y-2">
            <a href="/docs/quickstart" className="text-slate-600 hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300">
              Quickstart
            </a>
            <a href="/docs#routing" className="text-slate-600 hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300">
              Routing Policies
            </a>
            <a href="/docs#errors" className="text-slate-600 hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300">
              Error Codes
            </a>
          </nav>
          <div className="prose dark:prose-invert max-w-none">
            <h2>Welcome</h2>
            <p>
              Nexovra provides a unified OpenAI-compatible API for inference. Our
              intelligent routing engine selects the best model based on cost, quality,
              and your preferences.
            </p>
            <h2>Authentication</h2>
            <p>
              Sign in with Google OAuth or email/password to get started. All API
              requests are authenticated via API keys or session cookies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}