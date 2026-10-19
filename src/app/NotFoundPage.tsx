import { useEffect } from 'react';
import { ButtonLink } from '@/components/ui';

export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found · Nexovra';
  }, []);
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Page not found</h1>
      <p className="mt-3 max-w-md text-muted">The page you were looking for doesn't exist or has moved.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to="/">Back to home</ButtonLink>
        <ButtonLink to="/models" variant="outline">
          Browse models
        </ButtonLink>
      </div>
    </div>
  );
}
