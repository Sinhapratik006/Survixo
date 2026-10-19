import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-navy-900';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-navy-700 dark:text-brand-200 dark:hover:bg-navy-600',
  outline:
    'border border-brand-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50 dark:border-navy-500 dark:bg-transparent dark:text-slate-200 dark:hover:bg-navy-700',
  ghost: 'text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-navy-700 dark:hover:text-white',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leftIcon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
}

export function ButtonLink({ variant = 'primary', size = 'md', className, leftIcon, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {leftIcon}
      {children}
    </Link>
  );
}
