import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ButtonLink } from '@/components/ui';
import { useSession } from '@/features/auth/useSession';
import { useConfig } from '@/hooks/useConfig';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { to: '/models', label: 'Models' },
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/docs', label: 'Documentation' },
  { to: '/pricing', label: 'Pricing' },
];

function NavItem({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  const isHash = to.includes('#');
  const cls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive && !isHash ? 'text-brand-700 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
    );
  return isHash ? (
    <Link to={to} onClick={onClick} className={cls({ isActive: false })}>
      {label}
    </Link>
  ) : (
    <NavLink to={to} onClick={onClick} className={cls}>
      {label}
    </NavLink>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { data } = useSession();
  const signedIn = Boolean(data?.user);
  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100/80 bg-white/85 backdrop-blur-md dark:border-navy-700 dark:bg-navy-900/85">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          {signedIn ? (
            <ButtonLink to="/dashboard" size="sm">
              Dashboard
            </ButtonLink>
          ) : (
            <>
              <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                Sign in
              </Link>
              <ButtonLink to="/signup" size="sm">
                Start building <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-navy-700"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-brand-100 bg-white px-4 pb-4 pt-2 dark:border-navy-700 dark:bg-navy-900 lg:hidden">
          <div className="flex flex-col">
            {NAV.map((n) => (
              <NavItem key={n.to} {...n} onClick={() => setOpen(false)} />
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-brand-100 pt-3 dark:border-navy-700">
            {signedIn ? (
              <ButtonLink to="/dashboard">Dashboard</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/login" variant="outline">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/signup">Start building</ButtonLink>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

const FOOTER = [
  {
    title: 'Product',
    links: [
      ['Model marketplace', '/models'],
      ['Cost calculator', '/calculator'],
      ['Market analytics', '/analytics'],
      ['Pricing & fees', '/pricing'],
      ['Status', '/status'],
    ],
  },
  {
    title: 'Developers',
    links: [
      ['Documentation', '/docs'],
      ['Quickstart', '/docs/quickstart'],
      ['Routing policies', '/docs#routing'],
      ['Error codes', '/docs#errors'],
      ['Community', '/community'],
    ],
  },
  {
    title: 'Sellers',
    links: [
      ['Start selling', '/dashboard/sellers'],
      ['Seller guide', '/docs#selling'],
      ['Offer validation', '/docs#validation'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['Support', '/support'],
      ['Privacy', '/legal/privacy'],
      ['Terms', '/legal/terms'],
    ],
  },
];

export function Footer() {
  const { data: config } = useConfig();
  return (
    <footer className="border-t border-brand-100 bg-white dark:border-navy-700 dark:bg-navy-950">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">One API. Smarter routing. Better prices. Complete control.</p>
          <p className="mt-4 text-xs text-muted">"Nexovra" is a working name. Independent product, not affiliated with any referenced provider.</p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map(([label, to]) => (
                <li key={to}>
                  <Link to={to!} className="text-sm text-slate-600 hover:text-brand-700 dark:text-slate-400 dark:hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-brand-50 dark:border-navy-800">
        <div className="container-page flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-muted">
          <span>© {new Date().getFullYear()} Nexovra (working name)</span>
          {config?.demoMode && <span>Demo mode: catalog prices, demo offers and demo credits are illustrative, not live.</span>}
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
