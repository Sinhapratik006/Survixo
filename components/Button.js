import { cn } from './lib/cn.js';

const variants = {
  primary:
    'bg-brand-600 text-white shadow-sm shadow-brand-500/25 hover:bg-brand-700 hover:shadow-brand-500/40 focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 active:scale-[0.98]',
  secondary:
    'bg-slate-900 dark:bg-navy-700 text-white shadow-sm hover:bg-slate-800 dark:hover:bg-navy-600 focus-visible:ring-2 focus-visible:ring-slate-500/30 active:scale-[0.98]',
  outline:
    'border border-slate-200 dark:border-navy-700 text-slate-900 dark:text-white bg-transparent hover:bg-slate-50 dark:hover:bg-navy-800/30 hover:border-slate-300 dark:hover:border-navy-600 focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.98]',
  ghost:
    'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-800/30 hover:text-slate-900 dark:hover:text-white focus-visible:ring-2 focus-visible:ring-brand-500/30 active:scale-[0.98]',
  danger:
    'bg-rose-600 text-white shadow-sm shadow-rose-500/25 hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500/60 active:scale-[0.98]',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs leading-none',
  md: 'px-4 py-2 text-sm leading-none',
  lg: 'px-6 py-3 text-base leading-none',
};

export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  disabled = false,
  ...props
}) {
  return (
    <button
      type={props.type || 'button'}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 outline-none select-none',
        'disabled:opacity-60 disabled:pointer-events-none disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
