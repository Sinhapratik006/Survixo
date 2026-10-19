import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Badge, ButtonLink, DemoBadge } from '@/components/ui';
import { DocsToc, useDocsConfig, useDocsTitle, type TocGroup } from './docsKit';
import {
  ApiKeysSection,
  AuthenticationSection,
  CapabilitiesSection,
  GettingStartedSection,
  ModelsSection,
  RequestsSection,
  StreamingSection,
} from './sectionsBasics';
import { AgentModeSection, BudgetsSection, RoutingSection, UsageBillingSection } from './sectionsRouting';
import { ErrorsSection, RateLimitsSection, SdksSection, WebhooksSection } from './sectionsReference';
import { BenchmarksSection, SecuritySection, SellingSection, TeamsSection, ValidationSection } from './sectionsPlatform';

const TOC: TocGroup[] = [
  {
    title: 'Basics',
    items: [
      { id: 'getting-started', label: 'Getting started' },
      { id: 'authentication', label: 'Authentication' },
      { id: 'api-keys', label: 'API keys' },
      { id: 'models', label: 'Models' },
    ],
  },
  {
    title: 'Making requests',
    items: [
      { id: 'requests', label: 'Request format' },
      { id: 'streaming', label: 'Streaming' },
      { id: 'capabilities', label: 'Capabilities & adapters' },
    ],
  },
  {
    title: 'Routing & cost control',
    items: [
      { id: 'routing', label: 'Routing' },
      { id: 'agent-mode', label: 'Agent mode' },
      { id: 'usage-billing', label: 'Usage & billing' },
      { id: 'budgets', label: 'Budget Guard' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { id: 'errors', label: 'Errors' },
      { id: 'rate-limits', label: 'Rate limits' },
      { id: 'sdks', label: 'SDKs & examples' },
      { id: 'webhooks', label: 'Webhooks' },
      { id: 'security', label: 'Security' },
    ],
  },
  {
    title: 'Sellers',
    items: [
      { id: 'selling', label: 'Seller guide' },
      { id: 'validation', label: 'Validation & health' },
      { id: 'benchmarks', label: 'Benchmarks' },
    ],
  },
  {
    title: 'Organization',
    items: [{ id: 'teams', label: 'Teams & roles' }],
  },
];

/** Deep links (/docs#section) can arrive before this lazily loaded page has rendered; scroll once content (and config-dependent blocks) exist. */
function useInitialHashScroll(ready: boolean) {
  const { hash } = useLocation();
  const [initialHash] = useState(hash);
  useEffect(() => {
    if (!initialHash) return;
    document.getElementById(decodeURIComponent(initialHash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [initialHash, ready]);
}

export default function DocsPage() {
  useDocsTitle('Documentation · Nexovra');
  const ctx = useDocsConfig();
  useInitialHashScroll(!ctx.isLoading);

  return (
    <div className="container-page py-10">
      <header className="mb-8 max-w-3xl">
        <p className="eyebrow">Developer documentation</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Nexovra API documentation</h1>
          {ctx.demoMode && <DemoBadge label="Demo mode server" title="This server runs with demo offers and demo billing" />}
        </div>
        <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
          One OpenAI-compatible API in front of a marketplace of inference sellers. These pages describe exactly what the server implements: endpoints, routing rules, billing,
          limits and error codes.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ButtonLink to="/docs/quickstart" leftIcon={<BookOpen className="h-4 w-4" aria-hidden />}>
            Quickstart
          </ButtonLink>
          <ButtonLink to="/dashboard/api-keys" variant="outline">
            Get an API key <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
          {ctx.feePct && <Badge tone="brand">Platform fee {ctx.feePct} (paid from seller earnings)</Badge>}
          {ctx.billingMode && <Badge tone={ctx.billingMode === 'demo' ? 'demo' : 'neutral'}>Billing: {ctx.billingMode === 'demo' ? 'demo credits' : 'Stripe'}</Badge>}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <DocsToc groups={TOC} />
        </aside>
        <article className="prose-docs min-w-0 max-w-4xl">
          <GettingStartedSection ctx={ctx} />
          <AuthenticationSection />
          <ApiKeysSection />
          <ModelsSection ctx={ctx} />
          <RequestsSection ctx={ctx} />
          <StreamingSection ctx={ctx} />
          <CapabilitiesSection />
          <RoutingSection ctx={ctx} />
          <AgentModeSection ctx={ctx} />
          <UsageBillingSection ctx={ctx} />
          <BudgetsSection />
          <ErrorsSection ctx={ctx} />
          <RateLimitsSection />
          <SdksSection ctx={ctx} />
          <WebhooksSection />
          <SecuritySection />
          <SellingSection ctx={ctx} />
          <ValidationSection ctx={ctx} />
          <BenchmarksSection />
          <TeamsSection />
        </article>
      </div>
    </div>
  );
}
