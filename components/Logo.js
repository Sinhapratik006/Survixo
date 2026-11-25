import Link from 'next/link';
import { cn } from './lib/cn.js';

export function LogoMark({ size = 18, className = '' }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      // `lighten` drops the logo's black background into the page so only the white mark shows.
      className={cn('block shrink-0 object-contain mix-blend-lighten select-none', className)}
      style={{ width: size, height: size }}
    />
  );
}

export default function Logo({ className = '', size = 30 }) {
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
