export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-900">
      <div className="container-page py-12">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-4 text-slate-600 dark:text-slate-300">
          Your balance, spend, savings and request health at a glance.
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="rounded-lg border border-brand-100 bg-white p-6 dark:bg-navy-700">
            <h3 className="text-semibold text-slate-900 dark:text-white">Available balance</h3>
            <p className="mt-2 text-slate-500 dark:text-slate-400">$0.00</p>
          </div>
          <div className="rounded-lg border border-brand-100 bg-white p-6 dark:bg-navy-700">
            <h3 className="text-semibold text-slate-900 dark:text-white">Today's spend</h3>
            <p className="mt-2 text-slate-500 dark:text-slate-400">$0.00</p>
          </div>
          <div className="rounded-lg border border-brand-100 bg-white p-6 dark:bg-navy-700">
            <h3 className="text-semibold text-slate-900 dark:text-white">Month to date</h3>
            <p className="mt-2 text-slate-500 dark:text-slate-400">$0.00</p>
          </div>
          <div className="rounded-lg border border-brand-100 bg-white p-6 dark:bg-navy-700">
            <h3 className="text-semibold text-slate-900 dark:text-white">Requests (30d)</h3>
            <p className="mt-2 text-slate-500 dark:text-slate-400">0</p>
          </div>
        </div>
      </div>
    </div>
  );
}