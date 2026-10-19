import { useEffect, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Boxes,
  CreditCard,
  FlaskConical,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Route,
  Server,
  Settings,
  Store,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { useActiveOrg, useLogout, useSession, useSwitchOrg } from '@/features/auth/useSession';
import { useConfig } from '@/hooks/useConfig';
import { useTheme } from '@/hooks/useTheme';
import { Badge } from '@/components/ui';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

type Item = { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean };
const GROUPS: Array<{ title: string; items: Item[] }> = [
  { title: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Build',
    items: [
      { to: '/dashboard/playground', label: 'Playground', icon: FlaskConical },
      { to: '/dashboard/api-keys', label: 'API keys', icon: KeyRound },
      { to: '/dashboard/usage', label: 'Usage & requests', icon: Activity },
      { to: '/dashboard/routing', label: 'Routing', icon: Route },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/dashboard/billing', label: 'Billing & budgets', icon: CreditCard },
      { to: '/dashboard/alerts', label: 'Alerts & webhooks', icon: Bell },
      { to: '/dashboard/teams', label: 'Teams', icon: Users },
      { to: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
  {
    title: 'Sell',
    items: [
      { to: '/dashboard/sellers', label: 'Seller overview', icon: Store, end: true },
      { to: '/dashboard/sellers/offers', label: 'Endpoints & offers', icon: Server },
    ],
  },
  { title: 'Explore', items: [{ to: '/models', label: 'Model marketplace', icon: Boxes }, { to: '/status', label: 'Service status', icon: Gauge }] },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-5 px-3 py-4">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-navy-700 dark:text-white'
                        : 'text-slate-600 hover:bg-brand-50/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-navy-800 dark:hover:text-white',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function OrgSwitcher() {
  const { data } = useSession();
  const active = useActiveOrg();
  const switchOrg = useSwitchOrg();
  if (!data?.memberships.length || !active) return null;
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Active organization</span>
      <select
        value={active.id}
        onChange={(e) => switchOrg(e.target.value)}
        className="h-9 max-w-[220px] truncate rounded-lg border border-brand-100 bg-white px-2.5 text-sm font-medium text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100"
      >
        {data.memberships.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.role.toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

function AlertsBell() {
  const org = useActiveOrg();
  const { data } = useQuery({ queryKey: ['alerts', 'unread', org?.id], queryFn: () => api.get<{ unread: number }>('/api/alerts'), refetchInterval: 60_000 });
  const unread = data?.unread ?? 0;
  return (
    <Link
      to="/dashboard/alerts"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-navy-700 dark:hover:text-white"
      aria-label={unread ? `Alerts (${unread} unread)` : 'Alerts'}
    >
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cyan-500 ring-2 ring-white dark:ring-navy-900" aria-hidden />}
    </Link>
  );
}

function UserMenu() {
  const { data } = useSession();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const user = data?.user;
  if (!user) return null;
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-xs font-semibold text-white ring-2 ring-brand-100 dark:ring-navy-600"
        aria-label="Account menu"
      >
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="card absolute right-0 z-40 mt-2 w-64 p-1.5 shadow-lift">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{user.name ?? 'Signed in'}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <Link role="menuitem" to="/dashboard/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-navy-700">
              <Settings className="h-4 w-4" /> Settings
            </Link>
            <button role="menuitem" type="button" onClick={() => logout.mutate()} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-navy-700">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { data: config } = useConfig();
  const { data: session } = useSession();
  const { setTheme } = useTheme();
  const savedTheme = session?.user?.theme;
  useEffect(() => {
    // Apply the account's saved theme on devices without a local preference.
    if (savedTheme && !localStorage.getItem('nx_theme')) setTheme(savedTheme);
  }, [savedTheme, setTheme]);
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-900">
      <a href="#dashboard-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-brand-100 bg-white dark:border-navy-700 dark:bg-navy-950 lg:flex">
        <div className="flex h-16 items-center border-b border-brand-100 px-5 dark:border-navy-700">
          <Logo to="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-navy-950" role="dialog" aria-modal="true" aria-label="Dashboard navigation">
            <div className="flex h-16 items-center justify-between border-b border-brand-100 px-4 dark:border-navy-700">
              <Logo to="/dashboard" />
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-md p-2 text-slate-500 hover:bg-brand-50 dark:hover:bg-navy-700" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-brand-100 bg-white/90 px-4 backdrop-blur-md dark:border-navy-700 dark:bg-navy-900/90 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-navy-700 lg:hidden"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <OrgSwitcher />
          {config?.demoMode && (
            <Badge tone="demo" className="hidden sm:inline-flex" title="Demo adapters, demo offers and demo credits are enabled on this server">
              Demo mode
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <AlertsBell />
            <UserMenu />
          </div>
        </header>
        <main id="dashboard-main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
