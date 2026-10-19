import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FlaskConical, GitCompareArrows, Heart, Play, ShieldCheck, Swords } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent, formatPricePerM, formatTokens, formatUsd } from '@/lib/format';
import { useConfig } from '@/hooks/useConfig';
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, CodeBlock, CopyButton, DemoBadge, ErrorState, KeyValue, Skeleton, Table, Td, Th } from '@/components/ui';
import { CAPABILITY_LABEL } from '@/components/marketplace/ModelCard';
import { SavingsCalculator } from '@/features/calculator/SavingsCalculator';
import { tokenCost } from '@/features/calculator/calc';
import type { CatalogModel, ModelDetailResponse } from '@/types/api';
import { blendedDiscountPct, isDemoModel } from './filters';
import { useDocumentTitle } from './hooks';
import { useFavorites } from './useFavorites';
import { OffersTable } from './OffersTable';
import { BenchmarksTable } from './BenchmarksTable';
import { PriceHistoryChart } from './PriceHistoryChart';
import { modelCodeSamples } from './codeSamples';

const MODALITY_LABEL: Record<string, string> = { text: 'Text', image: 'Image', audio: 'Audio', video: 'Video', embedding: 'Embedding' };
const modalityList = (list: string[]) => (list.length ? list.map((m) => MODALITY_LABEL[m] ?? m).join(', ') : 'Not specified');

const COST_EXAMPLES = [
  { label: '1M input + 1M output', input: 1_000_000, output: 1_000_000 },
  { label: '3M input + 1M output (3:1 blend)', input: 3_000_000, output: 1_000_000 },
  { label: '20M input + 2M output (RAG-heavy)', input: 20_000_000, output: 2_000_000 },
];

function DetailSkeleton() {
  return (
    <div className="container-page py-10" role="status" aria-label="Loading model">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-8 w-80 max-w-full" />
      <Skeleton className="mt-2 h-4 w-60" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="mt-6 h-64" />
    </div>
  );
}

function Section({ id, title, description, actions, children }: { id: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-lg font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
          {description && <p className="mt-0.5 max-w-3xl text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function PriceCard({
  title,
  tone,
  price,
  meta,
  badges,
  empty,
}: {
  title: string;
  tone: 'baseline' | 'offer';
  price: { inputPerM: number; outputPerM: number } | null;
  meta?: ReactNode;
  badges?: ReactNode;
  empty: string;
}) {
  return (
    <Card className={cn('p-5', tone === 'offer' && price && 'ring-1 ring-inset ring-brand-200 dark:ring-brand-800')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
        <div className="flex flex-wrap gap-1.5">{badges}</div>
      </div>
      {price ? (
        <dl className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted">Input / 1M tokens</dt>
            <dd className="num mt-0.5 text-2xl font-semibold text-slate-900 dark:text-white">{formatPricePerM(price.inputPerM)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Output / 1M tokens</dt>
            <dd className="num mt-0.5 text-2xl font-semibold text-slate-900 dark:text-white">{formatPricePerM(price.outputPerM)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
      {meta && <div className="mt-3 text-sm text-muted">{meta}</div>}
    </Card>
  );
}

function CostExamples({ model }: { model: CatalogModel }) {
  const { baseline, bestOffer } = model;
  if (!baseline && !bestOffer) return null;
  return (
    <Card className="mt-4 overflow-hidden">
      <CardHeader title="Estimated cost examples" description="Straight token math at the prices above. Your real token counts depend on the tokenizer and prompts." />
      <Table>
        <thead>
          <tr>
            <Th>Monthly volume</Th>
            <Th className="text-right">At baseline</Th>
            <Th className="text-right">At best offer</Th>
            <Th className="text-right">Difference</Th>
          </tr>
        </thead>
        <tbody>
          {COST_EXAMPLES.map((ex) => {
            const base = baseline ? tokenCost(ex.input, ex.output, baseline.inputPerM, baseline.outputPerM) : null;
            const offer = bestOffer ? tokenCost(ex.input, ex.output, bestOffer.inputPerM, bestOffer.outputPerM) : null;
            const diff = base !== null && offer !== null ? base - offer : null;
            return (
              <tr key={ex.label}>
                <Td>{ex.label}</Td>
                <Td className="num text-right">{base !== null ? formatUsd(base) : '—'}</Td>
                <Td className="num text-right font-medium text-slate-900 dark:text-white">{offer !== null ? formatUsd(offer) : <span className="font-normal text-muted">No live offer</span>}</Td>
                <Td className="num text-right">
                  {diff === null ? (
                    '—'
                  ) : diff > 0 ? (
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatUsd(diff)} less</span>
                  ) : diff < 0 ? (
                    <span className="text-slate-500">{formatUsd(-diff)} more</span>
                  ) : (
                    'Same'
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

export default function ModelDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: config } = useConfig();
  const favorites = useFavorites();
  const query = useQuery({
    queryKey: ['model', id],
    queryFn: ({ signal }) => api.get<ModelDetailResponse>(`/api/models/${encodeURIComponent(id)}`, { signal }),
    enabled: Boolean(id),
  });
  const model = query.data?.model;
  useDocumentTitle(model ? `${model.name} · Models · Nexovra` : query.error instanceof ApiError && query.error.status === 404 ? 'Model not found · Nexovra' : 'Model · Nexovra');

  if (query.isLoading) return <DetailSkeleton />;

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className="container-page flex flex-col items-center py-24 text-center">
        <p className="eyebrow">Model not found</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">We couldn't find that model</h1>
        <p className="mt-3 max-w-md text-muted">
          No model matches <code className="rounded bg-brand-50 px-1.5 py-0.5 text-sm dark:bg-navy-700">{id}</code>. It may have been renamed or removed from the catalog.
        </p>
        <ButtonLink to="/models" className="mt-8">
          Browse all models
        </ButtonLink>
      </div>
    );
  }

  if (!query.data || !model) {
    return (
      <div className="container-page py-10">
        <h1 className="sr-only">Model details</h1>
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load this model" />
        </Card>
      </div>
    );
  }

  const { offers, benchmarks, priceHistory } = query.data;
  const demo = isDemoModel(model) || offers.some((o) => o.isDemo);
  const favorite = favorites.ids.has(model.id);
  const minSamples = config?.reliability.minSamples ?? 30;
  const windowDays = config?.reliability.windowDays ?? 7;
  const baseUrl = config?.apiBaseUrl ?? `${typeof window !== 'undefined' ? window.location.origin : ''}/v1`;
  const bestDiscount = model.bestOffer ? (model.bestOffer.discountPct ?? blendedDiscountPct(model.bestOffer, model.baseline)) : null;
  const historyDemo = priceHistory.some((h) => offers.find((o) => o.id === h.offerId)?.isDemo) || (demo && priceHistory.length > 0);

  return (
    <div className="container-page py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <ol className="flex flex-wrap items-center gap-1 text-muted">
          <li>
            <Link to="/models" className="hover:text-brand-700 dark:hover:text-white">
              Models
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li aria-current="page" className="truncate text-slate-700 dark:text-slate-200">
            {model.name}
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">{model.name}</h1>
            {demo && <DemoBadge />}
            {!model.apiSupported && <Badge tone="warning">Catalog only</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            by <span className="font-medium text-slate-700 dark:text-slate-200">{model.provider.name}</span>
            {model.family && <> · {model.family} family</>}
          </p>
          <div className="mt-2 flex items-center gap-1">
            <code className="rounded-md bg-brand-50 px-2 py-0.5 text-sm text-brand-800 dark:bg-navy-700 dark:text-brand-200">{model.id}</code>
            <CopyButton value={model.id} label="Copy model ID" />
          </div>
          {model.description && <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{model.description}</p>}
          {model.capabilities.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Capabilities">
              {model.capabilities.map((c) => {
                const verified = c.status === 'verified';
                return (
                  <li key={c.capability}>
                    <Badge tone={verified ? 'cyan' : 'brand'} title={verified ? `Verified by Nexovra${c.source ? ` (${c.source})` : ''}` : `Declared in catalog${c.source ? ` (${c.source})` : ''}; not yet verified`}>
                      {verified && <ShieldCheck className="h-3 w-3" aria-hidden />}
                      {CAPABILITY_LABEL[c.capability] ?? c.capability}
                      <span className="sr-only">{verified ? ' (verified)' : ' (declared)'}</span>
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            <ShieldCheck className="h-3 w-3" aria-hidden /> marks capabilities verified by Nexovra; others are declared by the catalog.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-sm lg:justify-end">
          <Button
            variant="outline"
            aria-pressed={favorite}
            onClick={() => favorites.toggle(model.id)}
            leftIcon={<Heart className={cn('h-4 w-4', favorite && 'text-rose-500')} fill={favorite ? 'currentColor' : 'none'} aria-hidden />}
          >
            {favorite ? 'Favorited' : 'Favorite'}
          </Button>
          <ButtonLink to={`/models?compare=${encodeURIComponent(model.id)}`} variant="outline" leftIcon={<GitCompareArrows className="h-4 w-4" aria-hidden />}>
            Add to compare
          </ButtonLink>
          {model.apiSupported && (
            <>
              <ButtonLink to={`/dashboard/playground?model=${encodeURIComponent(model.id)}`} leftIcon={<Play className="h-4 w-4" aria-hidden />}>
                Try in playground
              </ButtonLink>
              <ButtonLink to={`/dashboard/playground?tab=arena&models=${encodeURIComponent(model.id)}`} variant="secondary" leftIcon={<Swords className="h-4 w-4" aria-hidden />}>
                Compare in Arena
              </ButtonLink>
            </>
          )}
        </div>
      </header>

      {!favorites.signedIn && !favorites.sessionLoading && favorite && <p className="mt-3 text-xs text-muted">Saved in this browser. Sign in to sync favorites to your account.</p>}

      <Card className="mt-6 p-5">
        <KeyValue
          className="lg:grid-cols-3"
          items={[
            ['Input modalities', modalityList(model.inputModalities)],
            ['Output modalities', modalityList(model.outputModalities)],
            ['Context window', model.contextWindow ? `${formatTokens(model.contextWindow)} tokens (${formatNumber(model.contextWindow)})` : 'Unknown'],
            ['Max output', model.maxOutputTokens ? `${formatTokens(model.maxOutputTokens)} tokens` : 'Unknown'],
            ['Aliases', model.aliases.length ? <span className="flex flex-wrap gap-1">{model.aliases.map((a) => <code key={a} className="rounded bg-brand-50 px-1.5 text-xs dark:bg-navy-700">{a}</code>)}</span> : 'None'],
            ['Offers', `${model.healthyOfferCount} routable of ${model.offerCount} validated`],
          ]}
        />
      </Card>

      {!model.apiSupported && (
        <Alert tone="warning" title="Not callable through the API yet" className="mt-4">
          This model is listed for reference. It can't be routed until the marketplace supports its modality and a seller lists a validated offer.
        </Alert>
      )}

      <Section
        id="pricing"
        title="Pricing"
        description="The baseline is a catalog reference price used only for comparison. The offer price is what buyers actually pay: the cheapest routable offer from a seller whose endpoint passed validation. Discounts compare blended prices (3 input tokens per output token)."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <PriceCard
            title="Baseline (reference)"
            tone="baseline"
            price={model.baseline}
            empty="No baseline price is listed for this model."
            badges={model.baseline?.isDemo ? <DemoBadge label="Illustrative" /> : undefined}
            meta={model.baseline?.source ? <>Source: {model.baseline.source}</> : undefined}
          />
          <PriceCard
            title="Best available offer"
            tone="offer"
            price={model.bestOffer}
            empty="No routable offer right now."
            badges={
              <>
                {model.bestOffer?.isDemo && <DemoBadge label="Demo offer" />}
                {bestDiscount !== null && bestDiscount > 0 && <Badge tone="success">{formatPercent(bestDiscount, 0)} below baseline</Badge>}
              </>
            }
            meta={model.bestOffer ? <>Sold by {model.bestOffer.sellerName}. Routing may pick another offer based on your policy and live health.</> : undefined}
          />
        </div>
        <CostExamples model={model} />
      </Section>

      <Section id="offers" title="Offers" description={`Validated, active offers sorted by blended price. Latency and success rates are measured over the last ${windowDays} days.`}>
        <Card className="overflow-hidden">
          <OffersTable offers={offers} baseline={model.baseline} minSamples={minSamples} windowDays={windowDays} />
        </Card>
        {offers.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Reliability = 80% × the 95% lower bound of the success rate (requests + health checks) + 20% × a p95 latency component. Shown only after {minSamples} observations; select a score for details.
          </p>
        )}
      </Section>

      <Section id="history" title="Price history" description="Output price per 1M tokens for each offer over the last 30 days." actions={historyDemo ? <DemoBadge label="Demo prices" /> : undefined}>
        <Card>
          <CardBody>
            <PriceHistoryChart history={priceHistory} offers={offers} baselineOutputPerM={model.baseline?.outputPerM ?? null} />
          </CardBody>
        </Card>
      </Section>

      <Section
        id="benchmarks"
        title="Benchmarks"
        description="Public results from Nexovra benchmark runs. Expand a row to see the dataset, method and known limitations before drawing conclusions."
        actions={benchmarks.some((b) => b.isDemo) ? <DemoBadge label="Includes demo results" /> : undefined}
      >
        <Card className="overflow-hidden">
          <BenchmarksTable results={benchmarks} />
        </Card>
      </Section>

      <Section id="code" title="Call this model" description="Use any OpenAI-compatible SDK. Create an API key in your dashboard and export it as NEXOVRA_API_KEY.">
        {!model.apiSupported && (
          <Alert tone="warning" className="mb-3">
            This model isn't routable yet, so requests with this ID will be rejected. The snippet shows the request shape for when it becomes available.
          </Alert>
        )}
        <CodeBlock samples={modelCodeSamples(model.id, baseUrl)} />
      </Section>

      {model.baseline && model.apiSupported && (
        <Section id="calculator" title="Estimate your savings" description="Estimates only. Realized savings appear in your usage dashboard after real requests.">
          <SavingsCalculator compact initialModelId={model.id} />
        </Section>
      )}

      {demo && (
        <p className="mt-10 flex items-center gap-1.5 text-xs text-muted">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Values marked Demo are illustrative seed data, not live market measurements.
        </p>
      )}
    </div>
  );
}
