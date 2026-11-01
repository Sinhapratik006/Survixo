import { cn } from './lib/cn.js';

export default function Card({ children, className = '', hover = false, padded = true, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/50 backdrop-blur-sm',
        'transition-all duration-300 outline-none',
        hover
          ? 'hover:border-brand-300/60 dark:hover:border-brand-500/30 hover:shadow-cardHover hover:-translate-y-1'
          : '',
        padded ? 'p-6' : 'p-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
