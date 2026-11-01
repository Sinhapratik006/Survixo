import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Button from './Button';
import { Menu, X, Sun, Moon, Globe, DollarSign, BarChart3, Key, LogOut } from 'lucide-react';
import { api } from '../lib/api.js';

const navLinks = [
  { name: 'Marketplace', href: '/models', icon: Globe },
  { name: 'Calculator', href: '/calculator', icon: DollarSign },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
];

export default function Navbar() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('nexovra-theme');
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setDark(true);
    }
    (async () => {
      try {
        const res = await api.get('/api/auth/me');
        setAuthed(!!res.data.user);
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('nexovra-theme', next ? 'dark' : 'light');
    setDark(next);
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {}
    setAuthed(false);
    window.location.href = '/';
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/60 dark:border-navy-700/30 bg-white/80 dark:bg-navy-950/80 backdrop-blur-md">
      <div className="container-page">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30 relative overflow-hidden">
              <span className="text-white font-bold text-sm">N</span>
              <div className="absolute inset-0 bg-white/10" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">Surplus Intelligence</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors flex items-center gap-1.5"
                >
                  <Icon className="w-4 h-4" /> {link.name}
                </Link>
              );
            })}
            <div className="flex items-center gap-3">
              {authed === false ? (
                <Button variant="outline" size="sm" onClick={() => { router.push('/signup'); }}>
                  Get API key
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
                </Button>
              )}
              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              aria-label="Open menu"
            >
              {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden border-t border-slate-200/50 dark:border-navy-800/30 bg-white dark:bg-navy-950 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="container-page py-6 space-y-4">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="block text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 py-3 px-4 rounded-xl transition-colors flex items-center gap-1.5"
              >
                {link.name}
              </Link>
            ))}
            <div className="pt-4 border-t border-slate-100 dark:border-navy-800/30">
              <button
                onClick={() => { setIsOpen(false); toggleTheme(); }}
                className="flex items-center gap-2 w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-navy-800 bg-white/50 dark:bg-navy-900/30 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800/50 transition-colors text-left"
              >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {dark ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
            <div className="pt-4">
              {authed === false ? (
                <Button variant="outline" className="w-full" onClick={() => { setIsOpen(false); router.push('/signup'); }}>
                  Get API key
                </Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={handleLogout}>
                  <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
