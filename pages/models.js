export default function ModelsPage() {
  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-900">
      <div className="container-page py-12">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Model Marketplace
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          Browse and discover AI models with pricing and capabilities.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-brand-100 bg-white p-6 dark:bg-navy-800 dark:border-navy-700">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">No models yet</h3>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              Connect your API key to view available models.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}