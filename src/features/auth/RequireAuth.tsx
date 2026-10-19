import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState, Spinner } from '@/components/ui';
import { useSession } from './useSession';

/** Client-side guard for dashboard routes. The server enforces authorization on every endpoint regardless. */
export function RequireAuth() {
  const { data, isLoading, error, refetch } = useSession();
  const location = useLocation();
  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    );
  if (error) return <ErrorState error={error} onRetry={() => refetch()} className="min-h-screen" title="Could not reach the Nexovra API" />;
  if (!data?.user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}
