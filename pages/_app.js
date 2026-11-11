import './globals.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '../lib/api.js';
import { isPublicPath } from '../lib/authGate.js';

function GateSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas dark:bg-navy-950">
      <div className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-navy-700 border-t-brand-600 animate-spin" />
    </div>
  );
}

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  // null = session not confirmed yet (gate pending), true/false = confirmed.
  const [authed, setAuthed] = useState(null);
  const needsGate = !isPublicPath(router.pathname);

  useEffect(() => {
    const stored = localStorage.getItem('apitradex-theme');
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Session gate: every gated route verifies the session first and sends
  // signed-out visitors to /login?next=<page>, which returns them here after
  // signing in. Checked again on each navigation so an expired session falls
  // back to the login page instead of a screen full of failed requests.
  useEffect(() => {
    if (!needsGate) return;
    let cancelled = false;
    api.get('/api/auth/me')
      .then((res) => {
        if (cancelled) return;
        const ok = !!(res.data && res.data.user);
        setAuthed(ok);
        if (!ok) router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
      })
      .catch(() => {
        // A network blip must not lock anyone out — render the page and let
        // its own requests surface the problem.
        if (!cancelled) setAuthed(true);
      });
    return () => { cancelled = true; };
  }, [needsGate, router.pathname, router.asPath, router]);

  if (needsGate && authed !== true) return <GateSpinner />;

  return <Component {...pageProps} />;
}
