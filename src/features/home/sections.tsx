import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  Check,
  FlaskConical,
  History,
  ShieldCheck,
  Sparkles,
  Swords,
  TrendingDown,
  Users,
  Webhook,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { ButtonLink, Card, CodeBlock, DemoBadge, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { ModelCard } from '@/components/marketplace/ModelCard';
import { SavingsCalculator } from '@/features/calculator/SavingsCalculator';
import type { ModelsResponse } from '@/types/api';
import { ChartCard, LatencyChart, PriceMovementsChart, RequestVolumeChart } from '@/features/analytics/charts';
import { hasDemoData, isEmpty, useAnalytics } from '@/features/analytics/useAnalytics';
import { quickstartSamples, useApiBaseUrl } from './snippets';

export function SectionHeading({ eyebrow, title, description, action, id }: { eyebrow: string; title: ReactNode; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          {title}
        </h2>
        {description && <p className="mt-2 text-base leading-7 text-slate-600 dark:text-slate-300">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
      {children} <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

// ───────────────────────── C. Marketplace preview ─────────────────────────

export function MarketplacePreview() {
  const { data: config } = useConfig();
  const models = useQuery({ queryKey: ['models', 'popularity'], queryFn: () => api.get<ModelsResponse>('/api/models', { query: { sort: 'popularity' } }) });
  const list = (models.data?.data ?? []).filter((m) => m.apiSupported).slice(0, 6);
  const demo = Boolean(config?.demoMode) || list.some((m) => m.isDemo || m.bestOffer?.isDemo);

  return (
    <section aria-labelledby="marketplace-heading" className="container-page py-16 sm:py-20">
      <SectionHeading
        id="marketplace-heading"
        eyebrow="Marketplace"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Live offers, side by side {demo && <DemoBadge />}
          </span>
        }
        description="Every model lists its best current offer, the catalog baseline and measured latency, so you can compare before you send a single request."
        action={<SectionLink to="/models">Explore all models</SectionLink>}
      />
      {models.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading models">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card space-y-3 p-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-16" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          ))}
        </div>
      ) : models.error ? (
        <Card>
          <ErrorState error={models.error} onRetry={() => models.refetch()} title="Could not load the model catalog" />
        </Card>
      ) : !list.length ? (
        <Card>
          <EmptyState title="No API-supported models listed yet" description="Models appear here once they are added to the catalog and can be called through the API." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <ModelCard key={m.id} model={m} />
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── D. How it works ─────────────────────────

const BUYER_STEPS: Array<[string, string]> = [
  ['Create an account', 'Sign up in a minute and get a personal workspace for keys, balance and usage.'],
  ['Create an API key', 'Generate a scoped key with optional spend and rate limits; only a hash is kept on our side.'],
  ['Configure funding or billing', 'Add prepaid balance so requests can reserve their worst-case cost before dispatch.'],
  ['Choose a model or routing policy', 'Pin a specific model, or save a policy that weighs price, latency and reliability for you.'],
  ['Make API requests', 'Point any OpenAI-compatible client at the base URL and keep your existing code.'],
  ['Track usage and costs', 'See every request with its selected offer, charged amount and savings against baseline.'],
];

const SELLER_STEPS: Array<[string, string]> = [
  ['Create an account', 'Use the same account to buy and sell — switch views from the dashboard.'],
  ['Connect a supported inference endpoint', 'Register an OpenAI-compatible endpoint; its credentials are encrypted at rest.'],
  ['Configure a model offer and price', 'Map your upstream model to a catalog model and set input and output prices per 1M tokens.'],
  ['Complete verification and health checks', 'Automated probes confirm the endpoint answers correctly before your offer can be routed.'],
  ['Set capacity and request limits', 'Cap concurrency, requests per minute and daily volume so you never oversell.'],
  ['Monitor requests and eligible earnings', 'Follow served traffic, error rates and earnings after the platform fee as requests complete.'],
];

function StepList({ title, steps, cta }: { title: string; steps: Array<[string, string]>; cta: ReactNode }) {
  return (
    <Card className="flex flex-col p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
      <ol className="mt-5 flex-1 space-y-4">
        {steps.map(([name, text], i) => (
          <li key={name} className="flex gap-3">
            <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-xs font-semibold text-brand-700 dark:border-navy-500 dark:bg-navy-700 dark:text-brand-200">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{name}</p>
              <p className="mt-0.5 text-sm text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6">{cta}</div>
    </Card>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-y border-brand-100 bg-white py-16 dark:border-navy-700 dark:bg-navy-950 sm:py-20">
      <div className="container-page">
        <SectionHeading
          id="how-heading"
          eyebrow="How it works"
          title="One marketplace, two sides"
          description="Buyers get a single API across many sellers. Sellers turn spare inference capacity into routed, metered traffic."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <StepList
            title="For buyers"
            steps={BUYER_STEPS}
            cta={
              <ButtonLink to="/signup" variant="primary">
                Start building <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            }
          />
          <StepList
            title="For sellers"
            steps={SELLER_STEPS}
            cta={
              <ButtonLink to="/dashboard/sellers" variant="outline">
                Start earning <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            }
          />
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── E. Calculator ─────────────────────────

export function CalculatorSection() {
  return (
    <section aria-labelledby="calc-heading" className="container-page py-16 sm:py-20">
      <SectionHeading
        id="calc-heading"
        eyebrow="Cost savings"
        title="Estimate what you would pay"
        description="Compare your current spend at catalog baseline prices with the best offer on the marketplace today. Results are estimates, not guarantees."
        action={<SectionLink to="/calculator">Open the full calculator</SectionLink>}
      />
      <SavingsCalculator compact />
    </section>
  );
}

// ───────────────────────── F. Analytics preview ─────────────────────────

export function AnalyticsPreview() {
  const query = useAnalytics(30);
  const data = query.data;
  const demo = hasDemoData(data);
  return (
    <section aria-labelledby="analytics-heading" className="border-y border-brand-100 bg-white py-16 dark:border-navy-700 dark:bg-navy-950 sm:py-20">
      <div className="container-page">
        <SectionHeading
          id="analytics-heading"
          eyebrow="Market analytics"
          title={
            <span className="inline-flex flex-wrap items-center gap-3">
              The last 30 days, measured {demo && <DemoBadge label="Includes demo data" />}
            </span>
          }
          description="Traffic, prices and latency are computed from recorded requests and offer history. Nothing on these charts is projected or estimated."
          action={<SectionLink to="/analytics">View full analytics</SectionLink>}
        />
        {demo && <p className="-mt-4 mb-6 text-sm text-violet-700 dark:text-violet-300">Includes demo traffic generated against synthetic demo endpoints.</p>}
        {query.error ? (
          <Card>
            <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load marketplace analytics" />
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Request volume" unit="Requests per day by outcome" loading={query.isLoading} empty={data ? isEmpty.volume(data) : false} emptyText="No requests recorded yet." height={200}>
              {data && <RequestVolumeChart data={data.requestVolume} height={200} legend={false} />}
            </ChartCard>
            <ChartCard
              title="Price movements"
              unit={data?.priceMovements.unit ?? 'USD per 1M tokens (blended 3:1)'}
              loading={query.isLoading}
              empty={data ? isEmpty.prices(data) : false}
              emptyText="No offer price history yet."
              height={200}
            >
              {data && <PriceMovementsChart data={data.priceMovements} height={200} legend={false} />}
            </ChartCard>
            <ChartCard
              title="Latency distribution"
              unit="Successful attempts by latency"
              loading={query.isLoading}
              empty={data ? isEmpty.latency(data) : false}
              emptyText="No latency measurements yet."
              height={200}
              className="md:col-span-2 xl:col-span-1"
            >
              {data && <LatencyChart data={data.latencyDistribution} height={200} />}
            </ChartCard>
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────────────────── G. Developer integration ─────────────────────────

export function DeveloperSection() {
  const baseUrl = useApiBaseUrl();
  const points = [
    ['OpenAI-compatible requests and responses', 'Use the official OpenAI SDKs or any client that lets you set a base URL.'],
    ['Streaming', 'Server-sent events with token usage reported in the final chunk.'],
    ['Routing explanation on every response', 'The nexovra field names the offer, seller, cost and why it was chosen.'],
    ['Per-request controls', 'Set routing mode, a cost cap, latency or discount targets without changing your policy.'],
  ];
  return (
    <section aria-labelledby="dev-heading" className="container-page py-16 sm:py-20">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <SectionHeading
            id="dev-heading"
            eyebrow="Developers"
            title="Change the base URL. Keep your code."
            description="Requests follow the OpenAI chat completions format. Routing preferences are an optional extension you can add per request."
          />
          <ul className="space-y-4">
            {points.map(([title, text]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-navy-700 dark:text-brand-200">
                  <Check className="h-3 w-3" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/docs/quickstart">Read the quickstart</ButtonLink>
            <ButtonLink to="/community" variant="outline">
              Framework recipes
            </ButtonLink>
          </div>
        </div>
        <div className="min-w-0">
          <CodeBlock samples={quickstartSamples(baseUrl)} />
          <p className="mt-3 text-xs text-muted">
            Keep your key in the <code className="rounded bg-brand-50 px-1 py-0.5 text-brand-800 dark:bg-navy-700 dark:text-brand-200">NEXOVRA_API_KEY</code> environment variable — never commit it to source control.
          </p>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Smart features ─────────────────────────

const FEATURES: Array<{ title: string; text: string; to: string; icon: ReactNode }> = [
  { title: 'Budget Guard', text: 'Daily, monthly and per-request limits that stop spend before it happens.', to: '/dashboard/billing#budget', icon: <Wallet className="h-5 w-5" /> },
  { title: 'Model Match Assistant', text: 'Describe your task and get model suggestions grounded in catalog data.', to: '/dashboard/playground?tab=match', icon: <Sparkles className="h-5 w-5" /> },
  { title: 'Arena', text: 'Send one prompt to several models and compare answers, cost and latency.', to: '/dashboard/playground?tab=arena', icon: <Swords className="h-5 w-5" /> },
  { title: 'Request replay', text: 'Inspect any past request, its routing trace and every retry attempt.', to: '/dashboard/usage', icon: <History className="h-5 w-5" /> },
  { title: 'Benchmarks', text: 'Run small, documented evaluations against offers before you commit.', to: '/dashboard/playground?tab=benchmarks', icon: <FlaskConical className="h-5 w-5" /> },
  { title: 'Cost optimizer', text: 'Recommendations from your recent traffic: cheaper models, routing modes and token savings.', to: '/dashboard/playground?tab=optimizer', icon: <TrendingDown className="h-5 w-5" /> },
  { title: 'Team workspaces', text: 'Shared balance, roles and projects for everyone who builds with you.', to: '/dashboard/teams', icon: <Users className="h-5 w-5" /> },
  { title: 'Reliability score', text: 'Per-offer scores from measured success rates and tail latency.', to: '/models', icon: <ShieldCheck className="h-5 w-5" /> },
  { title: 'Webhooks', text: 'Signed events for budget thresholds, unusual usage, failed offers and revoked keys.', to: '/dashboard/alerts', icon: <Webhook className="h-5 w-5" /> },
  { title: 'Agent mode', text: 'Hard cost caps and task IDs for autonomous, multi-step workloads.', to: '/docs#agent-mode', icon: <Bot className="h-5 w-5" /> },
];

export function SmartFeatures() {
  return (
    <section aria-labelledby="features-heading" className="container-page py-16 sm:py-20">
      <SectionHeading id="features-heading" eyebrow="Built in" title="Tools for controlling cost and quality" description="Everything below is part of the product today — open any card to try it." />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FEATURES.map((f) => (
          <li key={f.title}>
            <Link
              to={f.to}
              className="group flex h-full flex-col rounded-xl border border-brand-100 bg-white p-4 shadow-card transition-colors hover:border-brand-300 dark:border-navy-600 dark:bg-navy-800 dark:hover:border-brand-700"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-navy-700 dark:text-brand-300" aria-hidden>
                {f.icon}
              </span>
              <span className="mt-3 text-sm font-semibold text-slate-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">{f.title}</span>
              <span className="mt-1 text-sm text-muted">{f.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────── H. Final CTA ─────────────────────────

export function FinalCta() {
  return (
    <section aria-labelledby="cta-heading" className="container-page pb-20">
      <div className="relative overflow-hidden rounded-xl bg-navy-900 px-6 py-12 text-center shadow-lift ring-1 ring-navy-700 sm:px-12 dark:bg-navy-800">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative">
          <h2 id="cta-heading" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Ship on the market price, not the list price.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">Create a key, point your client at the base URL and let routing find an offer that fits your constraints.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/signup" size="lg">
              Start building <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink to="/docs" size="lg" variant="outline" className="border-navy-500 bg-transparent text-white hover:bg-navy-700 dark:text-white">
              Read the docs
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

