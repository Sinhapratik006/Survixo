import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Explains baseline vs. offer prices and the blended-price convention used for discounts. */
export function PriceExplainer({ demoMode, className }: { demoMode?: boolean; className?: string }) {
  return (
    <aside className={cn('rounded-xl border border-brand-100 bg-white p-4 text-sm dark:border-navy-600 dark:bg-navy-800', className)} aria-labelledby="price-explainer-title">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
        <div className="min-w-0">
          <h2 id="price-explainer-title" className="font-semibold text-slate-900 dark:text-white">
            How to read prices
          </h2>
          <dl className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="font-medium text-slate-800 dark:text-slate-200">Baseline price</dt>
              <dd className="mt-0.5 text-muted">
                A catalog reference price per 1M tokens, used only as a point of comparison.{demoMode ? ' In demo mode these values are illustrative.' : ''} You are never billed at baseline.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-800 dark:text-slate-200">Offer price</dt>
              <dd className="mt-0.5 text-muted">What you actually pay: the price of an available marketplace offer from a seller whose endpoint passed validation.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-800 dark:text-slate-200">Discount</dt>
              <dd className="mt-0.5 text-muted">
                Compares blended prices assuming 3 input tokens per output token: 0.75 × input + 0.25 × output, offer vs. baseline.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </aside>
  );
}
