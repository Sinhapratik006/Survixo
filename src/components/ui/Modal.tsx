import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Accessible modal dialog: focus moves in on open, Escape/backdrop closes, focus is restored on close. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const previous = useRef<Element | null>(null);
  // Keep the latest onClose without re-running the focus effect on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement;
    const node = panel.current;
    const focusable = node?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close]), [href], [tabindex]:not([tabindex="-1"])');
    (focusable ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>('input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'));
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      (previous.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cn('card relative flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-xl', width)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-brand-50 px-5 py-4 dark:border-navy-700">
          <div>
            <h2 id={`${id}-title`} className="text-base font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
            {description && (
              <p id={`${id}-desc`} className="mt-0.5 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button data-close type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-brand-50 hover:text-slate-700 dark:hover:bg-navy-700" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-brand-50 px-5 py-3 dark:border-navy-700">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
