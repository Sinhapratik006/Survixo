import { cn } from './lib/cn.js';

const variants = {
  // Solid white — the primary call to action.
  primary: 'bg-ink text-[#0a0a0a] border border-ink hover:bg-white hover:border-white',
  // Cool blue gradient fill, for emphasis inside panels.
  secondary: 'bg-brand-gradient text-white border border-transparent hover:brightness-110 shadow-[0_0_24px_-6px_rgba(59,130,246,0.6)]',
  outline: 'bg-[#0b0b0b] text-ink border border-line-2 hover:border-ink-2',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:text-ink hover:border-line-2',
  danger: 'bg-transparent text-rose-400 border border-rose-500/50 hover:border-rose-400 hover:text-rose-300',
};

const sizes = {
  sm: 'h-[34px] px-3.5 text-xs',
  md: 'h-[42px] px-[18px] text-[13px]',
  lg: 'h-12 px-6 text-[13px]',
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
        'inline-flex items-center justify-center gap-2.5 font-mono uppercase tracking-[0.06em] leading-none',
        'transition-colors duration-150 outline-none select-none',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
