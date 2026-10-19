# Project: Build a Modern AI Inference Marketplace

## 1. Your Role

Act as a senior product designer, SaaS architect, full-stack React developer, AI infrastructure engineer, and security specialist. Build a production-minded web application inspired by the product concept of Surplus Intelligence, with an original brand identity, blue visual theme, improved UX, and meaningful new features.

Reference website: https://www.surplusintelligence.ai/

Study the reference website and its publicly available documentation before implementation. Understand its two-sided AI inference marketplace: buyers access AI models through a unified API, while sellers list available inference capacity and compete to serve requests. The reference also includes model discovery, pricing comparisons, savings calculations, analytics, developer documentation, and API-compatible integration. See the official [website](https://www.surplusintelligence.ai/), [documentation](https://www.surplusintelligence.ai/docs/getting-started/index), and [FAQ](https://www.surplusintelligence.ai/faq).

Do not copy the original website's exact text, branding, logo, or assets. Create an original product with comparable functionality and additional useful features.

## 2. Product Vision

Create a two-sided AI inference marketplace that connects:

- **Buyers:** Developers, startups, AI applications, and businesses that want affordable, reliable access to AI models.
- **Sellers:** AI infrastructure providers and eligible operators who can offer inference capacity at competitive prices.
- **AI agents:** Applications that automatically select models, optimize cost, and execute tasks through supported APIs.
- **Teams:** Organizations that need shared API keys, usage controls, spending limits, and auditability.

Core value proposition:

"One API. Smarter routing. Better prices. Complete control."

The platform should help users discover models, compare real prices, estimate costs, route inference requests, monitor usage, and manage their marketplace participation.

## 3. Brand and Visual Design

Create a distinctive brand that can be renamed later. Use `Nexovra` as a temporary working name, not a final trademark claim.

### Visual direction

- Primary color: deep blue, approximately `#155EEF`.
- Secondary blue: `#3B82F6`.
- Dark navy: `#0B1220`.
- Light background: `#F5F8FF`.
- White cards with subtle blue borders.
- Cyan accents for active data and selected actions.
- Green only for success, savings, healthy endpoints, and positive metrics.
- Neutral grays for secondary text.

Build a polished, premium, developer-first interface. Avoid excessive gradients, oversized rounded cards, unnecessary animations, and generic AI illustrations.

Use a responsive layout with consistent spacing, strong typography, subtle shadows, and accessible contrast.

Support light and dark modes, with blue as the primary brand accent in both.

## 4. Technology Stack

Use the following stack:

- React with Vite.
- JavaScript or TypeScript; prefer TypeScript for a maintainable production codebase.
- Tailwind CSS for styling.
- React Router for navigation.
- Lucide React for icons.
- Recharts for analytics charts.
- TanStack Query for server-state management.
- React Hook Form and Zod for form handling and validation.
- Node.js and Express for the backend, unless a well-justified alternative is needed.
- PostgreSQL with Prisma ORM for persistent application data.
- Redis for caching, rate limits, and appropriate background tasks.
- Vitest and React Testing Library for frontend tests.
- Playwright for critical end-to-end flows.

Use stable, mutually compatible dependency versions. Provide the complete configuration and setup instructions.

## 5. Required Website Pages

Implement these routes:

### Public pages

1. `/` — Homepage and product overview.
2. `/models` — AI model marketplace.
3. `/models/:id` — Model detail and pricing page.
4. `/calculator` — Inference cost and savings calculator.
5. `/docs` — Developer documentation.
6. `/docs/quickstart` — API integration guide.
7. `/analytics` — Public marketplace analytics.
8. `/community` — Community projects and integrations.
9. `/pricing` — Platform pricing and fee explanation.
10. `/login` and `/signup` — Authentication.
11. `/status` — Service health and incidents.

### Authenticated pages

12. `/dashboard` — Personalized overview.
13. `/dashboard/api-keys` — API key management.
14. `/dashboard/usage` — Usage and spending history.
15. `/dashboard/billing` — Account balance, transactions, and funding.
16. `/dashboard/routing` — Routing preferences and policies.
17. `/dashboard/playground` — Interactive model testing.
18. `/dashboard/sellers` — Seller dashboard.
19. `/dashboard/sellers/offers` — Manage model offers.
20. `/dashboard/teams` — Organization and team management.
21. `/dashboard/settings` — Account, security, and preferences.

Create reusable layouts for public pages and authenticated dashboards.

## 6. Homepage Design

Build a visually compelling landing page with these sections:

### A. Navigation

Include:
- Original logo and brand name.
- Models.
- How it works.
- Analytics.
- Documentation.
- Pricing.
- Sign in.
- Primary CTA: "Start building".

Use a responsive mobile navigation menu.

### B. Hero section

Headline:

"AI inference, at the price the market discovers."

Supporting text:

"Access multiple AI providers through one developer-friendly API. Compare offers, optimize inference costs, and route requests using your own quality, latency, and budget preferences."

Primary CTA: "Explore models".

Secondary CTA: "Start earning".

Include an interactive visual showing a request being routed to eligible offers according to price, availability, latency, and policy constraints.

Do not fabricate live market statistics or customer testimonials.

### C. Marketplace preview

Show sample model cards with:
- Model name.
- Provider.
- Modalities.
- Input and output price.
- Context window when known.
- Latency and availability when measured.
- Supported capabilities.
- Price comparison.
- "View model" action.

Label all sample data clearly as demo data until connected to real sources.

### D. How it works

Explain the buyer and seller flows side by side.

Buyer:
1. Create an account.
2. Create an API key.
3. Configure funding or billing.
4. Choose a model or routing policy.
5. Make API requests.
6. Track usage and costs.

Seller:
1. Create an account.
2. Connect a supported inference endpoint.
3. Configure a model offer and price.
4. Complete verification and health checks.
5. Set capacity and request limits.
6. Monitor requests and eligible earnings.

### E. Cost savings calculator

Allow visitors to:
- Select a model.
- Enter current monthly spend or estimated token usage.
- Set input/output token proportions.
- Choose a pricing scenario.
- Compare baseline cost against a hypothetical marketplace price.
- View estimated savings in money and percentage.

Use this calculation:

Estimated baseline cost =
(input tokens / 1,000,000 × input price per million)
+ (output tokens / 1,000,000 × output price per million).

Apply the same calculation to the proposed marketplace pricing.

Clearly distinguish estimates from actual realized savings. Include any applicable fees in the estimate when known.

### F. Analytics preview

Provide charts for:
- Model price movements.
- Available offers.
- Request volume.
- Estimated versus realized savings.
- Latency distribution.
- Marketplace activity over time.

Never present invented values as real market analytics.

### G. Developer integration

Show a concise example using an OpenAI-compatible SDK and a configurable base URL.

Keep API keys in environment variables. Do not put secret keys in frontend code.

### H. Final CTA and footer

Provide clear links to model discovery, documentation, seller onboarding, support, privacy, and terms.

## 7. Model Marketplace

Implement a useful model discovery interface.

### Features

- Search by model name and provider.
- Filter by text, vision, image generation, audio, video, embeddings, and other supported capabilities.
- Filter by provider, price range, context window, and availability.
- Sort by price, latency, popularity, or measured quality when data supports it.
- Compare up to four models side by side.
- Favorite models.
- View model capabilities and pricing details.
- Copy model identifiers.
- View provider and offer information where available.
- Show loading, empty, error, and stale-data states.

Include a model comparison panel with input price, output price, estimated monthly cost, context window, capabilities, latency, and reliability.

Treat provider pricing and seller offers as separate concepts. Explain which price is a baseline and which is an actual available marketplace offer.

Build the interface so that a real model registry can be connected later.

## 8. Unified Inference API

The central product capability is a single API that can route requests to multiple eligible model providers.

Design a backend API that supports, where applicable:

- Model listing.
- Model capability discovery.
- Chat completions.
- Streaming responses.
- Usage reporting.
- API key management.
- Request-level cost accounting.
- Health and status checks.

Aim for OpenAI-compatible request and response formats where appropriate.

Create a provider adapter layer rather than hardcoding provider logic into route handlers.

Each adapter should define supported capabilities, authentication, request conversion, response conversion, error handling, timeouts, and streaming behavior.

Never claim universal compatibility. Verify each provider and feature before listing it as supported.

### Routing engine

Implement a configurable routing policy that considers:

1. User-selected model or model family.
2. Supported input and output modalities.
3. Provider and offer health.
4. Price limits and minimum discount requirements.
5. Latency targets.
6. Quality or benchmark requirements, when available.
7. User trust and provider allowlists.
8. Rate limits and available capacity.
9. Timeout and retry policies.

Provide routing modes:
- Lowest eligible cost.
- Balanced cost and latency.
- Quality-first.
- Preferred provider.
- User-defined policy.

Only route to eligible offers that satisfy the requested constraints. Explain the selected offer and the reason for routing in an appropriate request trace.

Implement safe retry behavior. Avoid duplicate billing or duplicate non-idempotent operations during retries.

If no eligible offer exists, return a clear error rather than silently routing to an incompatible provider.

## 9. API Key and Usage Management

Create a secure API key management experience.

Users should be able to:
- Create named keys.
- See a masked key after initial creation.
- Revoke keys.
- Rotate keys.
- Set per-key spending limits.
- Set optional expiry dates.
- Associate keys with projects or environments.
- Review usage by key and model.
- Inspect request failures and latency.

Generate high-entropy keys using a cryptographically secure random generator.

Store only an appropriate cryptographic hash of each API key. Show the full key only once when created.

Never store plaintext API keys in application logs or ordinary database records.

Apply per-user, per-key, and per-IP rate limits where appropriate.

## 10. Billing and Payments

Build a billing architecture that supports:
- Account balances.
- Transaction history.
- Usage-based cost accounting.
- Configurable spending alerts.
- Prepaid credits.
- Refund and adjustment records.
- Seller earnings and payout records.
- Fee transparency.

For real payments, integrate a supported payment provider or wallet infrastructure through the backend.

If implementing cryptocurrency payments, use a clearly documented network and token, verify transactions server-side, and include appropriate security controls.

Never simulate successful payment confirmation in production.

If payment credentials or a payment provider are unavailable, build a demo billing mode and label it clearly.

Keep the pricing model and platform fees configurable rather than inventing fixed business terms.

## 11. Seller Marketplace

Allow eligible sellers to offer inference capacity.

Seller features:
- Register a provider endpoint.
- Securely configure provider credentials.
- Verify endpoint connectivity.
- Discover supported models.
- Set prices for input and output tokens.
- Set capacity limits and rate limits.
- Configure request timeouts.
- Enable or pause an offer.
- View health checks.
- View request volume, latency, errors, and earnings.
- Review transaction and payout history.
- Set account-level and offer-level limits.

Validate endpoints and prevent server-side request forgery (SSRF). Block private IP ranges, localhost, cloud metadata endpoints, and unsafe redirects unless a narrowly scoped, explicitly approved private-network configuration is used.

Encrypt sensitive credentials using a suitable secret-management or envelope-encryption approach. Restrict access and redact secrets from logs.

Require provider verification and health checks before offers become eligible for routing.

Do not allow a seller to claim support for a model without a verifiable model mapping and successful validation.

## 12. New Differentiating Features

Implement the following features in addition to the reference product's core concept.

### Feature 1: Smart Budget Guard

Users define:
- Daily budget.
- Monthly budget.
- Maximum cost per request.
- Maximum cost per task.
- Alert thresholds.

The system warns users before they approach their limits and enforces hard spending limits where technically possible.

Show remaining budget and explain when an in-flight request may still incur charges.

### Feature 2: Model Match Assistant

Let users describe a task, such as:
"Summarize 200-page PDFs with accurate citations at low cost."

Recommend candidate models using verified capability data, measured benchmarks, budget, and latency requirements.

Explain why each model is recommended. Do not claim the assistant has tested a model unless benchmark results actually exist.

Allow the user to compare recommendations and run a small evaluation.

### Feature 3: Side-by-Side Model Arena

Let users submit the same prompt to two or more supported models.

Show:
- Responses.
- Response time.
- Token usage.
- Actual request cost where available.
- User-selected quality ratings.
- Structured evaluation criteria.

Require explicit user consent before sending potentially sensitive prompts to multiple providers. Make clear that provider data-handling policies may differ.

### Feature 4: Request Replay and Debugging

Provide a request trace with:
- Timestamp.
- Model requested.
- Selected offer.
- Routing reason.
- Latency.
- Token usage.
- Cost.
- Retry count.
- Error details.

Support safe request replay with secrets redacted and sensitive payloads excluded by default.

### Feature 5: Model Quality Benchmarks

Show reproducible benchmark results for supported tasks.

Include:
- Benchmark name and version.
- Dataset description.
- Evaluation method.
- Sample size.
- Timestamp.
- Cost.
- Latency.
- Limitations.

Allow users to filter and compare models by measured results rather than marketing claims.

### Feature 6: Automatic Cost Optimizer

Analyze user usage patterns and recommend:
- Less expensive compatible models.
- Better routing policies.
- Prompt caching where supported.
- Batch processing where supported.
- Token reductions.
- Budget adjustments.

Show projected savings with transparent assumptions. Require approval before changing production routing or model settings.

### Feature 7: Team Workspaces

Support:
- Organizations.
- Multiple members.
- Role-based access.
- Shared budgets.
- Project-specific API keys.
- Usage allocation.
- Audit logs.
- Workspace-level routing preferences.

Enforce authorization on the backend, not only in the UI.

### Feature 8: Provider Reliability Score

Calculate an explainable score from measured availability, latency, failure rates, and sample size.

Show the time window and confidence limitations. Do not use a score without enough measurement data.

### Feature 9: Webhook and Alert Center

Allow users to configure events for:
- Budget thresholds.
- Offer failures.
- Provider downtime.
- Unusual usage.
- Key revocation.
- Payout status.

Sign outgoing webhooks, retry safely, and provide delivery logs.

### Feature 10: Cost-Aware AI Agent Mode

Provide an API or SDK integration that lets an application specify:
- Maximum budget.
- Preferred capabilities.
- Required quality level.
- Allowed providers.
- Latency limits.

The routing engine selects an eligible model while enforcing the defined constraints.

Do not imply that the agent can guarantee quality or savings beyond the measured data.

## 13. Dashboard Experience

Build a clean dashboard with:
- Current balance.
- Today's spend.
- Monthly spend.
- Requests served.
- Error rate.
- Median and percentile latency.
- Estimated savings.
- Budget remaining.
- Top models.
- Recent requests.
- Provider status.
- Quick actions.

Use real backend data when available. Otherwise, clearly label demo data.

Charts should include date ranges, tooltips, units, loading states, and empty states.

## 14. Developer Documentation

Provide practical documentation for:
- Getting started.
- Authentication.
- API keys.
- Supported models.
- API request formats.
- Streaming.
- Provider capabilities.
- Routing policies.
- Usage and billing.
- Error codes.
- Rate limits.
- SDK examples.
- Webhooks.
- Security and privacy.

Provide copyable examples in Python, JavaScript/TypeScript, and cURL.

Keep all code examples consistent with the implemented API.

## 15. Database Design

Create appropriate database models for:
- Users.
- Organizations.
- Organization members and roles.
- Projects.
- API keys.
- Providers.
- Provider credentials.
- Models.
- Model capabilities.
- Seller offers.
- Offer health checks.
- Routing policies.
- Inference requests.
- Usage records.
- Billing transactions.
- Budgets and alerts.
- Payouts.
- Webhook configurations and deliveries.
- Audit logs.
- Benchmark results.
- Favorites and model comparisons.

Use database migrations, indexes, appropriate foreign keys, and transaction-safe accounting.

Avoid storing full prompts and completions by default. Provide explicit retention settings and redact sensitive data.

## 16. Security Requirements

- Keep secrets in server-side environment variables or a secret manager.
- Never expose provider credentials or privileged keys in the frontend.
- Validate request bodies with schemas.
- Use secure authentication and session handling.
- Enforce authorization on every protected backend endpoint.
- Apply rate limiting and request-size limits.
- Protect against SSRF, injection, CSRF where relevant, and unsafe redirects.
- Validate provider responses.
- Set timeouts and bounded retries.
- Redact credentials from logs.
- Include audit trails for sensitive actions.
- Provide configurable retention and deletion policies.
- Handle provider failures without leaking secrets or internal infrastructure details.

Include a `.env.example` containing placeholder values only.

## 17. React Folder Structure

Organize the application into a clean, modular structure similar to:

```text
nexovra/
├── public/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   └── providers.tsx
│   ├── assets/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── charts/
│   │   └── marketplace/
│   ├── features/
│   │   ├── auth/
│   │   ├── models/
│   │   ├── calculator/
│   │   ├── playground/
│   │   ├── api-keys/
│   │   ├── usage/
│   │   ├── billing/
│   │   ├── sellers/
│   │   ├── routing/
│   │   ├── teams/
│   │   └── analytics/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── types/
│   ├── utils/
│   ├── styles/
│   └── main.tsx
├── server/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── providers/
│   │   ├── routing/
│   │   ├── billing/
│   │   ├── security/
│   │   └── index.ts
│   └── tests/
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── docker-compose.yml
```

Adjust the structure if necessary, but maintain clear separation between UI, business logic, API clients, provider adapters, and database access.

## 18. Testing and Acceptance Criteria

Write meaningful tests for the product's critical paths.

### Functional tests

- Model search, filtering, and comparison work.
- Cost calculations are mathematically correct.
- API keys can be created, displayed once, and revoked.
- Unauthorized users cannot access protected data.
- Budget limits are enforced server-side.
- Seller offers cannot become active without required validation.
- Routing respects model capabilities and configured constraints.
- Failed provider requests are handled correctly.
- Usage and billing records are consistent.
- Webhook signatures can be verified.
- Mobile navigation and dashboard layouts work.

### Quality requirements

- No broken routes.
- No dead buttons.
- No placeholder actions presented as completed features.
- No fabricated live statistics.
- No exposed API keys.
- No console errors in normal operation.
- Proper loading, error, empty, and success states.
- Keyboard-accessible navigation and forms.
- Responsive layouts for mobile, tablet, and desktop.
- Clear setup instructions and reproducible local development.

## 19. Implementation Strategy

Build the product in phases.

### Phase 1 — Frontend foundation

Create the complete blue-themed React application, navigation, homepage, marketplace, model details, savings calculator, analytics preview, and responsive dashboard.

### Phase 2 — Backend foundation

Add authentication, database models, API endpoints, model registry, usage tracking, and API key management.

### Phase 3 — Inference integration

Implement provider adapters, secure credential handling, health checks, routing policies, streaming, cost accounting, and error handling.

### Phase 4 — Seller and billing workflows

Add offer management, validation, balances, payment integration, earnings, and payout records.

### Phase 5 — Differentiating features

Add Smart Budget Guard, Model Match Assistant, Model Arena, request debugging, benchmarks, team workspaces, and cost optimization.

### Phase 6 — Quality assurance

Run automated tests, fix errors, verify every route and major interaction, review security, and document all configuration requirements.

## 20. Important Implementation Rules

1. Start by inspecting the reference website and its public documentation.
2. Produce a brief architecture plan before implementing the project.
3. Build a coherent, working application rather than a collection of static mockups.
4. Do not try to implement every advanced feature as an empty placeholder. Prioritize complete end-to-end workflows.
5. Use demo adapters and seed data when credentials or external integrations are unavailable. Clearly distinguish demos from production functionality.
6. Do not invent API endpoints, provider capabilities, prices, benchmark scores, or payment confirmations.
7. Keep the blue visual identity consistent across all pages.
8. Make reasonable implementation decisions independently instead of repeatedly asking for minor preferences.
9. Include every required source file, dependency, migration, environment example, and setup instruction.
10. Run the available build and tests, fix errors, and report any features that still require credentials or external services.
11. Never claim that live inference, billing, authentication, or seller payouts work unless they have actually been implemented and verified.
12. Treat this as an original product inspired by the marketplace concept, not an exact copy of the reference website.

## Final Deliverables

Deliver:
- A complete React frontend.
- A working backend API.
- Database schema and migrations.
- A blue-themed responsive UI.
- Model discovery and comparison.
- Savings calculator.
- Inference routing architecture.
- Buyer and seller dashboards.
- API key and usage management.
- Security and error handling.
- Automated tests.
- `.env.example`.
- A detailed README with installation and execution commands.
- A clear list of implemented features, demo-only features, and production integrations still required.

The final result should feel like a polished, trustworthy, developer-focused AI infrastructure startup with a distinctive blue identity and real product depth.