import { useEffect, type ReactNode } from 'react';
import { ArrowRight, Ban, ChevronDown, CreditCard, FlaskConical, Lock, Receipt, Scale, Store } from 'lucide-react';
import { useConfig } from '@/hooks/useConfig';
import { formatNumber, formatUsd } from '@/lib/format';
import { Alert, Badge, ButtonLink, Card, ErrorState, PageHeader, Skeleton } from '@/components/ui';

function Principle({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-navy-700 dark:text-brand-300" aria-hidden>
        {icon}
      </span>
      <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted">{children}</p>
    </Card>
  );
}

function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: 'success' | 'muted' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className={strong ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}>{label}</dt>
      <dd
        className={
          'num ' +
          (tone === 'success' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : tone === 'muted' ? 'text-muted' : strong ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200')
        }
      >
        {value}
      </dd>
    </div>
  );
}

const FAQ: Array<[string, ReactNode]> = [
  [
    'Is there a markup on top of the offer price?',
    'No. The price you pay per token is the price the seller listed for the offer that served your request. The platform fee is taken from the seller side, so it never appears on your bill as an extra line.',
  ],
  [
    'Why does my available balance drop before a request finishes?',
    'Before dispatching a request, the platform reserves its worst-case cost — estimated prompt tokens plus your max_tokens at the selected offer price. When the request completes, only actual usage is charged and the rest of the hold is released.',
  ],
  ['Am I charged for failed requests?', 'No. Requests that fail or are rejected before producing output are not billed, and their hold is released in full. If routing retries another offer, you only pay for the attempt that succeeded.'],
  [
    'What happens if a stream is interrupted?',
    'Streaming requests are billed for the tokens that were actually delivered. When the upstream does not report usage, tokens are estimated and the request is flagged as estimated in your usage log.',
  ],
  [
    'Are there plans, subscriptions or volume discounts?',
    'This deployment does not define plan tiers. Business terms such as the platform fee, payouts and any commercial agreements are configurable by the operator running the marketplace.',
  ],
  [
    'Can I cap what a single request costs?',
    <>
      Yes. Set <code>max_cost_usd</code> in the <code>nexovra</code> request field, a per-request limit in Budget Guard, or a spend limit on the API key. Requests that cannot fit within the cap are rejected before
      dispatch.
    </>,
  ],
  [
    'What are demo credits?',
    'In demo billing mode, balances are non-monetary credits used to try the product. They cannot be purchased, withdrawn or converted to money, and demo offers route to synthetic endpoints.',
  ],
];

export default function PricingPage() {
  const config = useConfig();
  const feeBps = config.data?.platformFeeBps ?? 0;
  const fee = feeBps / 10_000;
  const feePct = formatNumber(feeBps / 100, { maximumFractionDigits: 2 });
  const billingMode = config.data?.billingMode;

  useEffect(() => {
    document.title = 'Pricing · Nexovra';
  }, []);

  const charge = 1;
  const hold = 1.4;

  return (
    <div className="container-page py-10">
      <PageHeader
        title="Pricing and fees"
        description="Buyers pay the per-token price of the offer that serves each request. Sellers set those prices; the marketplace earns a fee from the seller side."
        badge={billingMode ? <Badge tone={billingMode === 'stripe' ? 'brand' : 'demo'}>{billingMode === 'stripe' ? 'Card billing' : 'Demo billing'}</Badge> : undefined}
      />

      {config.error ? (
        <Card>
          <ErrorState error={config.error} onRetry={() => config.refetch()} title="Could not load the current fee configuration" />
        </Card>
      ) : (
        <>
          <section aria-labelledby="fee-heading" className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Card className="p-6">
              <p className="eyebrow">Platform fee</p>
              <h2 id="fee-heading" className="sr-only">
                Platform fee
              </h2>
              {config.isLoading ? (
                <Skeleton className="mt-3 h-12 w-40" />
              ) : (
                <p className="num mt-2 text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">{feePct}%</p>
              )}
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                of each charged request, deducted from the seller's earnings. Buyers pay the listed offer price — nothing is added on top. This value is read live from the server configuration.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex gap-2">
                  <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
                  Cost = input tokens ÷ 1M × input price + output tokens ÷ 1M × output price.
                </li>
                <li className="flex gap-2">
                  <Store className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
                  Seller earnings = charged amount × (1 − {config.data ? `${feePct}%` : 'platform fee'}).
                </li>
              </ul>
            </Card>

            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Worked example</h2>
                <Badge>Illustrative amounts</Badge>
              </div>
              {config.isLoading ? (
                <div className="mt-4 space-y-3">
                  <Skeleton className="h-6" />
                  <Skeleton className="h-6" />
                  <Skeleton className="h-6" />
                </div>
              ) : (
                <>
                  <dl className="mt-3 divide-y divide-brand-50 text-sm dark:divide-navy-700">
                    <Row label="Hold reserved before dispatch" value={formatUsd(hold)} tone="muted" />
                    <Row label="Actual usage charged to buyer" value={formatUsd(charge)} strong />
                    <Row label="Hold released after completion" value={formatUsd(hold - charge)} tone="muted" />
                    <Row label={`Platform fee (${feePct}%)`} value={formatUsd(charge * fee, { precise: true })} />
                    <Row label="Seller receives" value={formatUsd(charge * (1 - fee), { precise: true })} tone="success" />
                  </dl>
                  <p className="mt-3 text-xs text-muted">
                    {formatUsd(charge)} × (1 − {feePct}%) = {formatUsd(charge * (1 - fee), { precise: true })}. The buyer pays {formatUsd(charge)} in total.
                  </p>
                </>
              )}
            </Card>
          </section>

          <section aria-labelledby="principles-heading" className="mt-12">
            <h2 id="principles-heading" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              How charges work
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Principle icon={<Scale className="h-5 w-5" />} title="Offer price, no markup">
                You pay the selected offer's input and output prices per token. The platform fee comes out of seller earnings.
              </Principle>
              <Principle icon={<Lock className="h-5 w-5" />} title="Reserve, then settle">
                The worst-case cost is held from your prepaid balance before dispatch. Only actual usage is charged afterwards.
              </Principle>
              <Principle icon={<Ban className="h-5 w-5" />} title="Failures are free">
                Failed and rejected requests are not billed. Retries on another offer only charge the attempt that succeeded.
              </Principle>
              <Principle icon={<Receipt className="h-5 w-5" />} title="Partial streams">
                If a stream ends early, you are billed for the tokens that were delivered — not for max_tokens.
              </Principle>
            </div>
          </section>

          <section aria-labelledby="billing-heading" className="mt-12">
            <h2 id="billing-heading" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Funding your balance
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Card className={'p-5 ' + (billingMode === 'demo' ? 'ring-2 ring-cyan-400' : '')}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <FlaskConical className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden /> Demo billing
                  </h3>
                  {billingMode === 'demo' && <Badge tone="cyan">Active on this server</Badge>}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Balances are non-monetary demo credits you can add from the billing page to explore the product. They have no cash value, cannot be withdrawn, and seller earnings in this mode are
                  equally illustrative.
                </p>
              </Card>
              <Card className={'p-5 ' + (billingMode === 'stripe' ? 'ring-2 ring-cyan-400' : '')}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <CreditCard className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden /> Card top-ups
                  </h3>
                  {billingMode === 'stripe' && <Badge tone="cyan">Active on this server</Badge>}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Add prepaid balance by card through Stripe Checkout. Requests draw down that balance as they complete; there is no subscription and nothing is charged automatically.
                </p>
              </Card>
            </div>
            {billingMode === 'demo' && (
              <Alert tone="demo" className="mt-4">
                This server runs in demo billing mode — no real payments are accepted and no real money changes hands.
              </Alert>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="faq-heading" className="mt-12">
        <h2 id="faq-heading" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Frequently asked questions
        </h2>
        <div className="card mt-5 divide-y divide-brand-50 dark:divide-navy-700">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-sm font-medium text-slate-900 dark:text-white">
                {q}
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300 [&_code]:rounded [&_code]:bg-brand-50 [&_code]:px-1 [&_code]:text-brand-800 dark:[&_code]:bg-navy-700 dark:[&_code]:text-brand-200">
                {a}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">See what your workload would cost</h2>
            <p className="mt-1 text-sm text-muted">Compare baseline prices with current offers, then create an account to start sending requests.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/calculator" variant="outline">
              Open calculator
            </ButtonLink>
            <ButtonLink to="/signup">
              Create account <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          </div>
        </Card>
      </section>
    </div>
  );
}
