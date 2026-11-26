/**
 * Per-route <head> metadata (title, description, robots) used by
 * `components/Seo.js`, which `_app.js` renders on every page — including while
 * the session gate is still showing its spinner, so crawlers and link
 * previews always get real metadata in the static HTML.
 *
 * Keep `public/sitemap.xml` and `public/robots.txt` in sync with this file:
 * every `index: true` route belongs in the sitemap, every private route is
 * disallowed in robots.txt.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.apitradex.com').replace(/\/$/, '');
export const SITE_NAME = 'ApiTradeX';
export const DEFAULT_IMAGE = `${SITE_URL}/logo.png`;
/** Bump when page content changes meaningfully; feeds dateModified in JSON-LD. */
export const LAST_UPDATED = '2026-11-26';

const DEFAULT_DESCRIPTION =
  'ApiTradeX is an AI inference marketplace: one OpenAI-compatible API that routes every request to the cheapest healthy seller for 50+ models.';

export const ROUTES = {
  '/': {
    title: 'ApiTradeX | One OpenAI-Compatible API for Every AI Model',
    description:
      'Call 50+ AI models through one OpenAI-compatible API. ApiTradeX routes each request to the cheapest healthy seller, with automatic fallback and no charge for failures.',
    index: true,
  },
  '/models': {
    title: 'AI Model Prices & Offers | ApiTradeX',
    description:
      'Compare live per-million-token prices for GPT, Claude, Gemini, Llama, DeepSeek and more. Filter by provider, context window, capability and discount vs list price.',
    index: true,
  },
  '/marketplace': {
    title: 'API Credit Marketplace | ApiTradeX',
    description:
      'Browse API credit listings from verified sellers on ApiTradeX. Buy discounted inference credits for top AI models and use them through one OpenAI-compatible API.',
    index: true,
  },
  '/calculator': {
    title: 'AI API Cost Savings Calculator | ApiTradeX',
    description:
      'Estimate how much you save on AI inference. Pick a model, enter your monthly API spend and compare list price with the best seller offer on ApiTradeX.',
    index: true,
  },
  '/analytics': {
    title: 'AI Inference Market Analytics | ApiTradeX',
    description:
      'Live aggregate stats for the ApiTradeX marketplace: request volume, tokens served, realized prices and average savings versus provider list prices.',
    index: true,
  },
  '/docs': {
    title: 'API Documentation | ApiTradeX',
    description:
      'Guides for the ApiTradeX inference API: quickstart, authentication, routing policies, budget guards, error codes and selling your own inference capacity.',
    index: true,
  },
  '/legal': {
    title: 'Terms of Service & Privacy | ApiTradeX',
    description:
      'Read the ApiTradeX terms of service and privacy policy covering accounts, API usage, marketplace purchases, seller payouts and how we handle your data.',
    index: true,
  },
  '/login': { title: 'Sign in | ApiTradeX', description: DEFAULT_DESCRIPTION, index: false },
  '/signup': { title: 'Create an account | ApiTradeX', description: DEFAULT_DESCRIPTION, index: false },
  '/market/[id]': { title: 'Model details | ApiTradeX', description: DEFAULT_DESCRIPTION, index: true },
  // Signed-in app screens: useful titles in the tab, but kept out of search.
  '/app/keys': { title: 'API keys | ApiTradeX', index: false },
  '/app/usage': { title: 'Usage | ApiTradeX', index: false },
  '/dashboard': { title: 'Dashboard | ApiTradeX', index: false },
  '/profile': { title: 'Profile | ApiTradeX', index: false },
  '/messages': { title: 'Messages | ApiTradeX', index: false },
  '/buyer/marketplace': { title: 'Orders | ApiTradeX', index: false },
  '/seller/dashboard': { title: 'Seller dashboard | ApiTradeX', index: false },
  '/seller/create': { title: 'Create listing | ApiTradeX', index: false },
  '/seller/payouts': { title: 'Payouts | ApiTradeX', index: false },
  '/seller/listing/[id]': { title: 'Listing | ApiTradeX', index: false },
  '/admin/messages': { title: 'Admin messages | ApiTradeX', index: false },
};

/** Metadata for a Next.js route pattern (router.pathname). Unknown routes are noindex. */
export function routeMeta(pathname) {
  const meta = ROUTES[pathname] || { title: SITE_NAME, index: false };
  return { description: DEFAULT_DESCRIPTION, ...meta };
}

export const ORGANIZATION_LD = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: DEFAULT_IMAGE,
};
