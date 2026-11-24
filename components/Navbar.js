import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Button from './Button';
import Logo from './Logo';
import { Menu, X, LogOut } from 'lucide-react';
import { api } from '../lib/api.js';
import { cn } from './lib/cn.js';

const navLinks = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Buyer', href: '/buyer/marketplace' },
  { name: 'Seller', href: '/seller/dashboard' },
  { name: 'Calculator', href: '/calculator' },
  { name: 'Analytics', href: '/analytics' },
  { name: 'Messages', href: '/messages' },
];

export default function Navbar() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [authed, setAuthed] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/auth/me');
        setAuthed(!!res.data.user);
        setIsAdmin(res.data.user?.role === 'ADMIN');
      } catch {
        setAuthed(false);
      }
    })();
    (async () => {
      try {
        const res = await api.get('/api/messages/unread-count');
        setUnreadCount(res.data.unreadCount || 0);
      } catch {
        // silent
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {}
    setAuthed(false);
    window.location.href = '/';
  };

  const links = [
    ...navLinks,
    ...(authed === true ? [{ name: 'Profile', href: '/profile' }] : []),
    ...(authed === true && isAdmin ? [{ name: 'Admin', href: '/admin/messages' }] : []),
  ];

  const isActive = (href) => router.pathname === href || router.pathname.startsWith(`${href}/`);

  const unreadBadge = (name) =>
    name === 'Messages' && unreadCount > 0 ? (
      <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-brand-500 text-[10px] text-[#0a0a0a] font-bold">
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    ) : null;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-[#070707]/90 backdrop-blur-md">
      <div className="container-page">
        <nav className="flex items-center gap-10 h-[70px]">
          <Logo />

          <div className="hidden lg:flex items-center gap-7 ml-auto font-mono text-[13px] uppercase tracking-[0.06em]">
            {links.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={cn(
                  'flex items-center transition-colors hover:text-ink',
                  isActive(link.href) ? 'text-ink' : 'text-ink-2',
                )}
              >
                {link.name}
                {unreadBadge(link.name)}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3">
            {authed === true && (
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </Button>
            )}
            {authed === false && (
              <>
                <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
                  Sign in
                </Button>
                <Button size="sm" onClick={() => router.push('/signup')}>
                  Start free
                </Button>
              </>
            )}
            {authed === null && <div className="w-40 h-[34px]" aria-hidden="true" />}
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden ml-auto w-[34px] h-[34px] flex items-center justify-center border border-line-2 text-ink-2 hover:border-ink-2 hover:text-ink transition-colors"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </nav>
      </div>

      {isOpen && (
        <div className="lg:hidden border-t border-line bg-[#070707]">
          <div className="container-page py-4">
            <div className="border border-line-2">
              {links.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center justify-between px-4 py-3 border-b border-line last:border-b-0 font-mono text-[13px] uppercase tracking-[0.06em] hover:bg-navy-900 hover:text-ink transition-colors',
                    isActive(link.href) ? 'text-ink' : 'text-ink-2',
                  )}
                >
                  <span className="flex items-center">
                    {link.name}
                    {unreadBadge(link.name)}
                  </span>
                  <span className="text-ink-faint">→</span>
                </Link>
              ))}
            </div>
            <div className="pt-4 grid gap-3">
              {authed === true && (
                <Button variant="outline" className="w-full" onClick={handleLogout}>
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </Button>
              )}
              {authed === false && (
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="w-full" onClick={() => { setIsOpen(false); router.push('/login'); }}>
                    Sign in
                  </Button>
                  <Button className="w-full" onClick={() => { setIsOpen(false); router.push('/signup'); }}>
                    Start free
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
