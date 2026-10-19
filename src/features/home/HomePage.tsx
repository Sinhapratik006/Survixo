import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { RoutingVisual } from './RoutingVisual';
import { AnalyticsPreview, CalculatorSection, DeveloperSection, FinalCta, HowItWorks, MarketplacePreview, SmartFeatures } from './sections';

const HERO_POINTS = ['OpenAI-compatible API', 'No buyer-side markup', 'Routing explained on every response'];

function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden border-b border-brand-100 dark:border-navy-700">
      <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
      <div className="container-page relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
        <div>
          <p className="eyebrow">Inference marketplace</p>
          <h1 id="hero-heading" className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            AI inference, at the price the <span className="text-brand-600 dark:text-brand-400">market discovers.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
            Access multiple AI providers through one developer-friendly API. Compare offers, optimize inference costs, and route requests using your own quality, latency, and budget preferences.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/models" size="lg">
              Explore models <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink to="/dashboard/sellers" size="lg" variant="outline">
              Start earning
            </ButtonLink>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
            {HERO_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <RoutingVisual />
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { hash } = useLocation();

  useEffect(() => {
    document.title = 'Nexovra · AI inference marketplace';
  }, []);

  // The page is lazy-loaded, so the layout's hash scroll can run before these sections exist.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <>
      <Hero />
      <MarketplacePreview />
      <HowItWorks />
      <CalculatorSection />
      <AnalyticsPreview />
      <DeveloperSection />
      <SmartFeatures />
      <FinalCta />
    </>
  );
}
