import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatNumber, formatPercent, formatPricePerM, formatTokens, formatUsd } from '@/lib/format';
import { useConfig } from '@/hooks/useConfig';
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from '@/components/ui';
import { SavingsCalculator } from './SavingsCalculator';
import { estimateSavings, splitTokens } from './calc';

/** Fixed, clearly labelled example prices for the worked example (not tied to any real model). */
const EXAMPLE_BASELINE = { inputPerM: 1.0, outputPerM: 3.0 };
const EXAMPLE_MARKET = { inputPerM: 0.6, outputPerM: 1.8 };
const EXAMPLE_INPUT_SHARE = 0.75;
const EXAMPLE_VOLUMES = [10_000_000, 100_000_000, 1_000_000_000];

function WorkedExample({ feeBps }: { feeBps: number | null }) {
  const feeRate = (feeBps ?? 0) / 10_000;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Worked example"
        description={
          <>
            Example prices only, not a quote: baseline {formatPricePerM(EXAMPLE_BASELINE.inputPerM)} in / {formatPricePerM(EXAMPLE_BASELINE.outputPerM)} out, marketplace offer{' '}
            {formatPricePerM(EXAMPLE_MARKET.inputPerM)} / {formatPricePerM(EXAMPLE_MARKET.outputPerM)} per 1M tokens, 75% input tokens.
          </>
        }
        actions={<Badge tone="neutral">Example</Badge>}
      />
      <Table className="[&_table]:min-w-[760px]">
        <caption className="sr-only">Worked cost example for three monthly token volumes using fixed example prices</caption>
        <thead>
          <tr>
            <Th>Monthly tokens</Th>
            <Th className="text-right">Input / output</Th>
            <Th className="text-right">Baseline cost</Th>
            <Th className="text-right">Buyer pays</Th>
            <Th className="text-right">Est. savings</Th>
            <Th className="text-right">Seller receives</Th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLE_VOLUMES.map((total) => {
            const { inputTokens, outputTokens } = splitTokens(total, EXAMPLE_INPUT_SHARE);
            const e = estimateSavings({ inputTokens, outputTokens, baseline: EXAMPLE_BASELINE, marketplace: EXAMPLE_MARKET, buyerFeeRate: 0 });
            return (
              <tr key={total}>
                <Td className="num font-medium text-slate-900 dark:text-white">{formatTokens(total)}</Td>
                <Td className="num text-right">
                  {formatTokens(inputTokens)} / {formatTokens(outputTokens)}
                </Td>
                <Td className="num text-right">{formatUsd(e.baselineUsd)}</Td>
                <Td className="num text-right font-medium text-slate-900 dark:text-white">{formatUsd(e.marketplaceUsd)}</Td>
                <Td className="num text-right">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatUsd(e.savingsUsd)}</span>
                  <span className="ml-1 text-xs text-muted">({formatPercent(e.savingsPct, 0)})</span>
                </Td>
                <Td className="num text-right">{feeBps === null ? '—' : formatUsd(e.marketplaceUsd * (1 - feeRate))}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

export default function CalculatorPage() {
  useEffect(() => {
    document.title = 'Inference cost calculator · Nexovra';
  }, []);
  const { data: config } = useConfig();
  const feeBps = config?.platformFeeBps ?? null;
  const feePct = feeBps !== null ? formatNumber(feeBps / 100, { maximumFractionDigits: 2 }) : null;

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        title="Inference cost calculator"
        description="Estimate what a workload costs at catalog baseline prices versus current marketplace offers. Pick a model, enter your spend or token volume, and adjust the input/output split."
      />

      <SavingsCalculator />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="calc-how-title" className="card p-5 sm:p-6">
          <h2 id="calc-how-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            How the estimate is calculated
          </h2>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-navy-600 bg-navy-900 p-4 text-[13px] leading-6 text-slate-100">
            <code>{`cost     = input_tokens  / 1,000,000 × input_price_per_1M
         + output_tokens / 1,000,000 × output_price_per_1M

savings  = cost_at_baseline − cost_at_marketplace_price
savings% = savings / cost_at_baseline × 100`}</code>
          </pre>
          <p className="mt-3 text-sm text-muted">
            When you start from a monthly spend, the calculator first converts it into tokens at the baseline blended price: tokens = spend ÷ (input share × input price + output share × output price) × 1M.
          </p>

          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="font-semibold text-slate-900 dark:text-white">Baseline price</dt>
              <dd className="mt-1 text-slate-600 dark:text-slate-300">
                A reference price per 1M tokens from the model catalog, used only as a yardstick. {config?.demoMode ? 'In demo mode, baseline prices are illustrative and may not match any provider’s current list price. ' : ''}
                Nobody is billed at baseline.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900 dark:text-white">Marketplace price</dt>
              <dd className="mt-1 text-slate-600 dark:text-slate-300">
                The price of an actual offer listed by a seller whose endpoint passed validation. “Best current offer” uses the cheapest routable offer on a blended 3:1 input:output basis; you can also model a hypothetical discount or a custom price.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900 dark:text-white">Fees</dt>
              <dd className="mt-1 text-slate-600 dark:text-slate-300">
                Buyers pay exactly the offer price, with no buyer-side markup. The platform fee
                {feePct !== null ? ` of ${feePct}%` : ''} is deducted from the seller’s earnings, which is why buyer-side fees show as {formatUsd(0)}.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900 dark:text-white">Estimated, not realized</dt>
              <dd className="mt-1 text-slate-600 dark:text-slate-300">
                These numbers are projections. Realized savings, computed per request from the tokens actually billed, appear in your{' '}
                <Link to="/dashboard/usage" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                  usage dashboard
                </Link>{' '}
                once you send real traffic.
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="calc-assumptions-title" className="card p-5 sm:p-6">
          <h2 id="calc-assumptions-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            Assumptions & caveats
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Token counts vary by tokenizer: the same text can produce noticeably different counts on different model families.</li>
            <li>Prices can change. Offers are repriced by sellers, and the best offer at request time may differ from the one shown here.</li>
            <li>Routing policies (fastest, most reliable, quality floors, seller allowlists) can select a more expensive offer than the cheapest one.</li>
            <li>Retries, failed requests and fallback models are not included in the estimate.</li>
            <li>Output share matters: output tokens usually cost several times more than input tokens, so chat-heavy workloads save differently from retrieval-heavy ones.</li>
          </ul>
          <p className="mt-4 text-sm text-muted">
            Want to compare several models at once? Use the{' '}
            <Link to="/models" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
              model marketplace
            </Link>{' '}
            and select up to four models for a side-by-side cost comparison.
          </p>
        </section>
      </div>

      <div className="mt-6">
        <WorkedExample feeBps={feeBps} />
      </div>
    </div>
  );
}
