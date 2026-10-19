import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#155EEF" />
      <path d="M9 22V10l14 12V10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="10" r="2.2" fill="#22D3EE" />
    </svg>
  );
}

/** "Nexovra" is a temporary working name, not a trademark claim. */
export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5 rounded-md', className)} aria-label="Nexovra home">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Nexovra</span>
    </Link>
  );
}
