import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

/** Router-level error boundary (e.g. a lazy chunk fails to load after a deploy). */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : 'Unexpected error';
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted">{message}</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Reload
        </button>
        <Link to="/" className="rounded-lg border border-brand-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-brand-50 dark:border-navy-500 dark:text-slate-200">
          Go home
        </Link>
      </div>
    </div>
  );
}
