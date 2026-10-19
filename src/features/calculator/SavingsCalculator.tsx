import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent, formatPricePerM, formatTokens, formatUsd } from '@/lib/format';
import { useConfig } from '@/hooks/useConfig';
import { Card, DemoBadge, ErrorState, Input, Label, LoadingBlock, Select, Tabs } from '@/components/ui';
import type { ModelsResponse } from '@/types/api';
import { applyDiscount, estimateSavings, splitTokens, tokensFromSpend } from './calc';

type Basis = 'spend' | 'tokens';
type Scenario = 'best' | 'discount' | 'custom';

/**
 * Inference cost & savings estimator. All results are estimates based on
 * catalog baseline prices and current offers - not realized savings.
 */
export function SavingsCalculator({ compact = false, initialModelId }: { compact?: boolean; initialModelId?: string }) {
  const { data: config } = useConfig();
  const models = useQuery({ queryKey: ['models', 'calculator'], queryFn: () => api.get<ModelsResponse>('/api/models', { query: { sort: 'name' } }) });
  const priced = useMemo(() => (models.data?.data ?? []).filter((m) => m.apiSupported && m.baseline), [models.data]);

  const [modelId, setModelId] = useState(initialModelId ?? '');
  const [basis, setBasis] = useState<Basis>('spend');
  const [monthlySpend, setMonthlySpend] = useState(500);
  const [monthlyTokens, setMonthlyTokens] = useState(100); // millions
  const [inputShare, setInputShare] = useState(75);
  const [scenario, setScenario] = useState<Scenario>('best');
  const [discount, setDiscount] = useState(40);
  const [customIn, setCustomIn] = useState(0.1);
  const [customOut, setCustomOut] = useState(0.2);

  useEffect(() => {
    if (!modelId && priced.length) setModelId((priced.find((m) => m.bestOffer) ?? priced[0]!).id);
  }, [priced, modelId]);

  const model = priced.find((m) => m.id === modelId);
  const result = useMemo(() => {
    if (!model?.baseline) return null;
    const share = inputShare / 100;
    const total = basis === 'spend' ? tokensFromSpend(monthlySpend, model.baseline.inputPerM, model.baseline.outputPerM, share) : monthlyTokens * 1_000_000;
    const { inputTokens, outputTokens } = splitTokens(total, share);
    const market =
      scenario === 'best' && model.bestOffer
        ? { inputPerM: model.bestOffer.inputPerM, outputPerM: model.bestOffer.outputPerM }
        : scenario === 'custom'
          ? { inputPerM: customIn, outputPerM: customOut }
          : applyDiscount(model.baseline, discount);
    return { market, estimate: estimateSavings({ inputTokens, outputTokens, baseline: model.baseline, marketplace: market, buyerFeeRate: 0 }) };
  }, [model, basis, monthlySpend, monthlyTokens, inputShare, scenario, discount, customIn, customOut]);

  if (models.isLoading) return <Card className="p-6"><LoadingBlock rows={5} /></Card>;
  if (models.error) return <Card><ErrorState error={models.error} onRetry={() => models.refetch()} /></Card>;
  if (!priced.length) return <Card className="p-6 text-sm text-muted">No models with baseline prices are available yet.</Card>;

  const demo = Boolean(model?.baseline?.isDemo || (scenario === 'best' && model?.bestOffer?.isDemo));
  const feePct = (config?.platformFeeBps ?? 0) / 100;

  return (
    <Card className={cn('grid overflow-hidden', compact ? 'lg:grid-cols-[1.1fr_1fr]' : 'lg:grid-cols-[1.2fr_1fr]')}>
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-brand-600" aria-hidden />
          <h3 className="font-semibold text-slate-900 dark:text-white">Estimate your monthly cost</h3>
        </div>
        <div>
          <Label htmlFor="calc-model">Model</Label>
          <Select id="calc-model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {priced.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} - {m.provider.name}
              </option>
            ))}
          </Select>
          {model?.baseline && (
            <p className="mt-1.5 text-xs text-muted">
              Baseline: {formatPricePerM(model.baseline.inputPerM)} in / {formatPricePerM(model.baseline.outputPerM)} out per 1M tokens
              {model.bestOffer && (
                <>
                  {' '}· Best offer: {formatPricePerM(model.bestOffer.inputPerM)} / {formatPricePerM(model.bestOffer.outputPerM)}
                </>
              )}
            </p>
          )}
        </div>

        <div>
          <Tabs<Basis>
            tabs={[
              { id: 'spend', label: 'Current monthly spend' },
              { id: 'tokens', label: 'Token volume' },
            ]}
            value={basis}
            onChange={setBasis}
          />
          <div className="mt-3">
            {basis === 'spend' ? (
              <>
                <Label htmlFor="calc-spend">Monthly spend at baseline prices (USD)</Label>
                <Input id="calc-spend" type="number" min={0} step={10} value={monthlySpend} onChange={(e) => setMonthlySpend(Math.max(0, Number(e.target.value) || 0))} />
              </>
            ) : (
              <>
                <Label htmlFor="calc-tokens">Monthly tokens (millions)</Label>
                <Input id="calc-tokens" type="number" min={0} step={1} value={monthlyTokens} onChange={(e) => setMonthlyTokens(Math.max(0, Number(e.target.value) || 0))} />
              </>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="calc-share" className="mb-0">
              Input / output split
            </Label>
            <span className="num text-sm text-muted">
              {inputShare}% input · {100 - inputShare}% output
            </span>
          </div>
          <input id="calc-share" type="range" min={0} max={100} step={5} value={inputShare} onChange={(e) => setInputShare(Number(e.target.value))} className="mt-2 w-full accent-brand-600" />
        </div>

        <div>
          <Label htmlFor="calc-scenario">Pricing scenario</Label>
          <Select id="calc-scenario" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
            <option value="best" disabled={!model?.bestOffer}>
              Best current offer{model?.bestOffer ? '' : ' (no healthy offer)'}
            </option>
            <option value="discount">Hypothetical discount off baseline</option>
            <option value="custom">Custom marketplace price</option>
          </Select>
          {scenario === 'discount' && (
            <div className="mt-3">
              <Label htmlFor="calc-discount">Discount: {discount}%</Label>
              <input id="calc-discount" type="range" min={0} max={90} step={5} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="w-full accent-brand-600" />
            </div>
          )}
          {scenario === 'custom' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="calc-cin">Input $/1M</Label>
                <Input id="calc-cin" type="number" min={0} step={0.01} value={customIn} onChange={(e) => setCustomIn(Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div>
                <Label htmlFor="calc-cout">Output $/1M</Label>
                <Input id="calc-cout" type="number" min={0} step={0.01} value={customOut} onChange={(e) => setCustomOut(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-5 border-t border-brand-100 bg-brand-50/50 p-5 dark:border-navy-600 dark:bg-navy-900/50 sm:p-6 lg:border-l lg:border-t-0">
        {result && (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="eyebrow">Estimated, not realized</p>
                {demo && <DemoBadge label="Demo prices" />}
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Tokens / month</dt>
                  <dd className="num font-medium">
                    {formatTokens(result.estimate.inputTokens)} in · {formatTokens(result.estimate.outputTokens)} out
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Baseline cost</dt>
                  <dd className="num font-medium">{formatUsd(result.estimate.baselineUsd)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Marketplace cost</dt>
                  <dd className="num font-medium">{formatUsd(result.estimate.marketplaceUsd)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Buyer-side fees</dt>
                  <dd className="num font-medium">{formatUsd(result.estimate.buyerFeesUsd)}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-lg border border-brand-100 bg-white p-4 dark:border-navy-600 dark:bg-navy-800">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Estimated monthly savings</p>
              <p className={cn('num mt-1 text-3xl font-semibold', result.estimate.savingsUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600')}>
                {formatUsd(result.estimate.savingsUsd)}
              </p>
              <p className="num text-sm text-muted">{formatPercent(result.estimate.savingsPct)} vs. baseline</p>
            </div>
            <p className="flex gap-2 text-xs text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Cost = input tokens ÷ 1M × input price + output tokens ÷ 1M × output price. Buyers pay the offer price; the {formatNumber(feePct)}% platform fee is deducted from seller earnings. Actual savings depend on
                routing, availability and real token counts{compact ? '.' : '; see realized savings in your usage dashboard.'}
              </span>
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
