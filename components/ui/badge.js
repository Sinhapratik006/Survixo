import { cn } from '../lib/cn.js';

export default function Badge({ className = '', variant = 'default', ...props }) {
  const variants = {
    default: 'bg-brand-600 text-white',
    secondary: 'bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-navy-700',
    destructive: 'bg-rose-600 text-white',
    outline: 'border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 bg-transparent',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-none transition-colors',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
