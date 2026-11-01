import { cn } from './lib/cn.js';

export default function Input({ label, helper, error, leftIcon, rightIcon, className = '', ...props }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-tighter">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
            {leftIcon}
          </div>
        )}
        <input
          className={cn(
            'block w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-navy-400',
            'bg-white dark:bg-navy-900/40',
            'border-slate-200 dark:border-navy-600',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:border-brand-500 transition-all duration-200',
            leftIcon ? 'pl-10' : '',
            rightIcon ? 'pr-10' : '',
            error
              ? 'border-rose-500 focus:ring-rose-500/60 focus:border-rose-500'
              : 'hover:border-slate-300 dark:hover:border-navy-500',
            props.className,
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="text-[10px] text-rose-500 dark:text-rose-400 font-medium leading-none">{error}</p>
      )}
      {helper && !error && (
        <p className="text-[10px] text-slate-500 dark:text-slate-500 font-medium leading-none">{helper}</p>
      )}
    </div>
  );
}
