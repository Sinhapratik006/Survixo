import { cn } from '../lib/cn.js';

export default function Badge({ className = '', variant = 'default', ...props }) {
  const variants = {
    default: 'border-brand-500/60 text-brand-400',
    secondary: 'border-line-2 text-ink-2 bg-navy-800',
    destructive: 'border-rose-500/50 text-rose-400',
    outline: 'border-line-2 text-ink-muted bg-transparent',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] leading-tight',
        variants[variant] || variants.default,
        className,
      )}
      {...props}
    />
  );
}
