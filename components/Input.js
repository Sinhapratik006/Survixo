import { cn } from './lib/cn.js';

export default function Input({ label, helper, error, leftIcon, rightIcon, className = '', ...props }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            {leftIcon}
          </div>
        )}
        <input
          className={cn(
            'block w-full h-[42px] border px-3 text-sm text-ink placeholder:text-ink-faint',
            'bg-[#070707] border-line-2',
            'focus:outline-none focus:border-ink-2 transition-colors duration-150',
            leftIcon ? 'pl-10' : '',
            rightIcon ? 'pr-10' : '',
            error ? 'border-rose-500 focus:border-rose-400' : 'hover:border-ink-faint',
            props.className,
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
            {rightIcon}
          </div>
        )}
      </div>
      {error && <p className="font-mono text-[11px] text-rose-400 leading-snug">{error}</p>}
      {helper && !error && <p className="font-mono text-[11px] text-ink-faint leading-snug">{helper}</p>}
    </div>
  );
}
