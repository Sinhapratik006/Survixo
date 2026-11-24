import { cn } from './lib/cn.js';

export default function Card({ children, className = '', hover = false, padded = true, ...props }) {
  return (
    <div
      className={cn(
        'border border-line-2 bg-[#0a0a0a] transition-colors duration-150 outline-none',
        hover ? 'hover:border-ink-faint hover:bg-navy-900' : '',
        padded ? 'p-6' : 'p-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
