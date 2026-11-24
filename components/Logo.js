import Link from 'next/link';
import { cn } from './lib/cn.js';

export function LogoMark({ size = 18, className = '' }) {
  return (
    <i
      aria-hidden="true"
      className={cn('block shrink-0 bg-brand-500', className)}
      style={{
        width: size,
        height: size,
        clipPath: 'polygon(0 0,100% 0,100% 100%,35% 100%,0 65%)',
      }}
    />
  );
}

export default function Logo({ className = '', size = 18 }) {
  return (
    <Link
      href="/"
      className={cn('flex items-center gap-2.5 font-mono font-bold text-[19px] tracking-[0.08em] text-ink', className)}
    >
      <LogoMark size={size} />
      APITRADEX
    </Link>
  );
}
