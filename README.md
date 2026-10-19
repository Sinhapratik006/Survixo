# Nexovra: AI inference marketplace

> **Nexovra** is a temporary working name, not a trademark claim. This is an original product inspired by the two-sided inference-marketplace concept. It is not affiliated with any referenced company.

**One API. Smarter routing. Better prices. Complete control.**

Buyers call a single OpenAI-compatible endpoint. Sellers list validated inference capacity. A routing engine picks an eligible offer for each request based on price, measured latency, measured quality, health, capacity and the buyer's policy. Every request is billed exactly once from a prepaid balance and gets a full routing trace.

---

## Contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Google sign-in setup](#google-sign-in-setup)
- [Scripts](#scripts)
- [Testing](#testing)
- [API overview](#api-overview)
- [Security model](#security-model)
- [What is real, what is demo, what needs credentials](#what-is-real-what-is-demo-what-needs-credentials)
- [Project structure](#project-structure)

---

## Quick start

Requirements: **Node.js ≥ 20.11** (developed on 22) and npm. Docker is optional.

```bash
npm install
cp .env.example .env          # then fill in the three secrets (commands are in the file)

# PostgreSQL. Option A: no Docker (embedded PostgreSQL, keep this running in its own terminal)
npm run db:local
# PostgreSQL. Option B: Docker
docker compose up -d postgres redis   # then add REDIS_URL=redis://localhost:6379 to .env

npm run db:deploy             # apply migrations
npm run db:seed -- --traffic  # demo catalog, demo sellers, demo buyer, demo traffic and benchmarks
npm run dev                   # API on :8787, web app on http://localhost:5173
```

Sign in at <http://localhost:5173/login> as `demo@nexovra.local` / `demo-password-123` (created by the seed in demo mode only), or create your own account.

Generate the secrets on Windows/macOS/Linux:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_SECRET, API_KEY_PEPPER
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # ENCRYPTION_MASTER_KEY
```

Make a first API request (create a key in **Dashboard → API keys**):

```bash
export NEXOVRA_API_KEY=nxv_...
curl http://localhost:5173/v1/chat/completions \
  -H "Authorization: Bearer $NEXOVRA_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"llama-3.1-8b-instruct","messages":[{"role":"user","content":"Hello"}],"max_tokens":64}'
```

```python
from openai import OpenAI
import os
client = OpenAI(base_url="http://localhost:5173/v1", api_key=os.environ["NEXOVRA_API_KEY"])
r = client.chat.completions.create(
    model="llama-3.1-8b-instruct",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={"nexovra": {"routing_mode": "balanced", "max_cost_usd": 0.01}},
)
print(r.choices[0].message.content)
```

Production build (one Node process serves the API and the built SPA):

```bash
npm run build && NODE_ENV=production npm start
# or: docker compose --profile app up --build
```

---

## Architecture

```
Browser (React SPA) ── cookie session + CSRF ──► /api/*  (dashboard API)
SDKs / agents ───────── Bearer nxv_... ────────► /v1/*   (OpenAI-compatible API)
                                                   │
                         ┌─────────────────────────▼──────────────────────────┐
                         │ Express 5 API                                       │
                         │  validate (zod) → policy → routing engine (pure)    │
                         │  → Budget Guard → balance hold → adapter (failover) │
                         │  → single-transaction settlement → request trace    │
                         └───────┬───────────────┬──────────────┬─────────────┘
                                 │               │              │
                          PostgreSQL        Redis (rate     Provider adapters
                          (Prisma)          limits, cache,   openai_compatible (SSRF-safe fetch)
                                            concurrency)     demo (synthetic, demo mode only)
Background workers (same process): webhook delivery · recovery probes · retention · unusual-usage alerts
```

**Inference request lifecycle** (`server/src/services/inference.ts`):

1. Validate the OpenAI-style body plus the optional `nexovra` extension (routing mode, max cost, min discount, latency, reliability, quality, provider allow/block lists, required capabilities, task id).
2. Resolve the policy (`policy_id` → project policy → org default → platform default). Per-request overrides can only tighten limits.
3. Resolve the model (or `auto`). Derive the required capabilities: streaming, tools, vision, JSON mode, input modalities.
4. **Routing engine** (`server/src/routing/engine.ts`, pure and unit-tested). It filters by status, verification, validation, health, capabilities, adapter features, context window, price caps, minimum discount, latency, reliability, quality, allow/block lists, concurrency, RPM and seller daily caps. It then ranks by mode: lowest cost, balanced, quality-first, preferred provider, or custom weights. Every rejection keeps a reason.
5. **Budget Guard**: per-key spend limit, daily/monthly/per-request/per-task budgets. `max_cost_usd` caps `max_tokens` so the charge can't exceed it.
6. **Hold**: the worst-case cost is reserved with an atomic conditional update, so concurrent requests can't overdraw the balance.
7. Call adapters with timeouts and bounded failover. Retries only happen before any bytes have been streamed. Failed offers enter an exponential backoff ladder (1 → 60 min) and return only after a recovery probe succeeds.
8. **Settlement** in one database transaction: release the hold, debit the actual cost (never more than the hold), credit seller earnings minus the platform fee, update the daily usage rollup and per-key spend. A unique `(type, requestId)` constraint makes double billing impossible.
9. The trace (ranked candidates, rejections, constraints, estimates, attempts) is stored and shown in the dashboard and at `GET /v1/requests/:id`.

Money is stored as BigInt **micro-USD**. Prices are micro-USD per 1M tokens.

---

## Configuration

All configuration is in environment variables, validated at startup (`server/src/config/env.ts`). See [`.env.example`](.env.example) for every variable.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Required in production. Without it, development uses an in-memory store (single process only) |
| `SESSION_SECRET`, `API_KEY_PEPPER` | ≥32 chars each. Sign OAuth state, pepper API-key HMACs |
| `ENCRYPTION_MASTER_KEY` | 32 bytes base64. Key-encryption key for envelope-encrypted secrets |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enable Google sign-in |
| `DEMO_MODE` | Enables the synthetic demo adapter and demo offers. **Must be false in production** |
| `BILLING_MODE` | `demo` (labelled, non-monetary credits) or `stripe` (requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) |
| `PLATFORM_FEE_BPS` | Platform fee deducted from seller earnings (500 = 5%) |
| `ALLOW_INSECURE_ENDPOINTS`, `PRIVATE_ENDPOINT_ALLOWLIST` | Narrow, explicit exceptions to SSRF rules (development only) |
| `ADMIN_EMAILS` | Accounts that get the platform admin role (payout processing, adjustments, incidents) |
| `AUTH_RATE_LIMIT_PER_MINUTE` | Per-IP limit on sign-in/sign-up (default 10) |

Production refuses to start with `DEMO_MODE=true`, `BILLING_MODE=demo`, insecure endpoints, or no Redis.

---

## Google sign-in setup

The implementation is a standard OAuth 2.0 authorization-code flow with **PKCE (S256)**, a **state** parameter, and an OpenID Connect **nonce**:

- `GET /api/auth/google/start` creates the state, nonce and PKCE verifier and stores them in a short-lived **HMAC-signed, httpOnly** cookie. It then redirects to Google with `scope=openid email profile`.
- `GET /api/auth/google/callback` checks the state, exchanges the code with the PKCE verifier, and verifies the ID token with `google-auth-library` (signature, audience, issuer, expiry). It also checks the nonce and requires `email_verified`. On success it creates a fresh session and redirects to a **validated same-site path** (open-redirect safe).
- Account linking: the same Google `sub` signs into the same account. A matching verified email links to the existing user. If an *unverified* password account already exists with that email, its password and sessions are revoked first. This prevents a pre-account-takeover attack. Signed-in users can link or unlink Google in **Settings**.

To enable it:

1. Google Cloud Console → *APIs & Services* → *Credentials* → **Create OAuth client ID** → *Web application*.
2. Authorized redirect URI: `http://localhost:5173/api/auth/google/callback` for development (via the Vite proxy). In production use `https://<your-domain>/api/auth/google/callback`. Set `GOOGLE_REDIRECT_URI` if it differs from `APP_URL + /api/auth/google/callback`.
3. Put the client ID and secret in `.env` and restart. Until then the "Continue with Google" button stays disabled and explains why.

The flow is covered by integration tests with a stubbed Google gateway (`server/tests/integration/auth.test.ts`). A real Google round trip needs your own OAuth credentials.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API (tsx watch, :8787) and Vite (:5173, proxies `/api` and `/v1`) |
| `npm run build` | Typecheck and build the SPA to `dist/`, compile the API to `server/dist/` |
| `npm start` | Run the compiled API (serves `dist/` when `NODE_ENV=production`) |
| `npm run typecheck` | Typecheck frontend and backend |
| `npm run db:local` | Embedded PostgreSQL on :5433 (no Docker) |
| `npm run db:migrate` / `db:deploy` / `db:reset` | Prisma migrations (dev / apply / reset) |
| `npm run db:seed [-- --traffic]` | Demo catalog, sellers and buyer (plus demo traffic and benchmarks) |
| `npm run ledger:reconcile` | Verify balances equal ledger sums and that no request was billed twice |
| `npm test` | Frontend and backend unit tests |
| `npm run test:integration` | API integration tests on a throwaway PostgreSQL (embedded automatically) |
| `npm run test:e2e` | Playwright end-to-end tests |

---

## Testing

- **Backend unit tests** (`server/tests/unit`): routing eligibility and every routing mode, policy merging, money math, fee split, reliability score, backoff ladder, token estimation, SSRF address classification and URL validation, envelope encryption, API-key generation and hashing, password hashing, redaction, webhook and Stripe signatures, Google OAuth state/PKCE/redirect safety, Model Match analysis, benchmark grading.
- **Integration tests** (`server/tests/integration`, real PostgreSQL through supertest):
  - auth: sign-up/login/logout, CSRF and origin checks, 401s on protected routes, the full Google flow including state mismatch, unverified email, open-redirect attempts and pre-account takeover
  - API keys: shown once, stored hashed, revoke/rotate, per-key RPM limits
  - routing: cheapest eligible offer, header and policy overrides, `auto`, capability mismatches return clear errors
  - billing: exact settlement and ledger invariants, idempotency (no double billing), failover with a single charge, total failure charges nothing
  - Budget Guard (key limits, daily caps, per-request caps, alerts once per period); insufficient balance
  - tenant isolation and RBAC
  - sellers: SSRF blocking, an **OpenAI-compatible adapter against a local mock upstream** (verification, encrypted credentials, mapping verification, validation-before-activation, streaming, upstream errors without leaked internals, recovery probe), payouts
  - signed webhook delivery with retries; the alert center
- **Frontend unit tests** (`tests/unit`, Vitest + Testing Library): cost-calculator math, model search/filter/compare limit, navigation and mobile menu, route guard, dashboard mobile drawer, login/sign-up validation, the Google button states, formatting.
- **E2E** (`tests/e2e`, Playwright): home → models, sign-up → API key shown once → revoke, playground request, protected-route redirect, mobile navigation. Run `npx playwright install chromium` once, with a seeded database.

```bash
npm test                    # unit (web + server)
npm run test:integration    # needs no setup; starts embedded PostgreSQL
npm run test:e2e            # needs db:local + db:deploy + db:seed
```

---

## API overview

OpenAI-compatible API (`Authorization: Bearer nxv_...`):

| Endpoint | Description |
| --- | --- |
| `GET /v1/models`, `GET /v1/models/:id` | API-supported models, with capabilities and prices in a `nexovra` field |
| `POST /v1/chat/completions` | Chat completions, streaming (SSE) or not. Optional `nexovra` body field, `Idempotency-Key`, `X-Nexovra-Routing`, `X-Min-Discount`, `X-Nexovra-Task-Id` headers |
| `GET /v1/usage?days=` | Usage for the calling key |
| `GET /v1/balance` | Balance, holds and key spend |
| `GET /v1/requests/:id` | Request trace (routing decision and attempts) for requests made with the key |

Responses include `nexovra: { request_id, seller, cost_usd, baseline_cost_usd, estimated_savings_usd, routing_mode, routing_reason, retries, usage_estimated, demo, latency_ms }`, plus `x-nexovra-request-id` and `x-nexovra-cost-usd` headers. Errors use the OpenAI error envelope with stable codes (`model_not_found`, `no_eligible_offer`, `insufficient_balance`, `daily_budget_exceeded`, `idempotency_conflict`, `upstream_unavailable`, …). The full reference is in the in-app docs at `/docs`.

`/api/*` is the web app's API (cookie session + CSRF). It is not a public contract.

---

## Security model

- **Sessions**: random 256-bit tokens in `httpOnly`, `SameSite=Lax` cookies (`Secure` over HTTPS). Only SHA-256 hashes are stored. Each sign-in gets a new session. Users can revoke sessions.
- **CSRF**: Origin check plus a double-submit token bound to the session hash on every state-changing request.
- **Passwords**: scrypt (N=2¹⁵), with timing-equalized login for unknown accounts.
- **API keys**: `nxv_` + 40 base62 characters (≈238 bits) from the OS CSPRNG. Only a peppered HMAC-SHA256 is stored, and the plaintext is shown once. Keys can have spend limits, RPM limits, expiry and projects.
- **Authorization**: enforced on the server for every route. Five org roles map to a permission matrix (`server/src/middleware/org.ts`), and membership is verified on every request.
- **Rate limits**: per IP, user, API key and org (Redis-backed), plus stricter limits on auth, payouts, replays and benchmarks. Request bodies are capped at 2 MB.
- **SSRF**: seller endpoints and webhooks must be https. Private, loopback, link-local, CGNAT, metadata and reserved ranges are rejected (including IPv4-mapped IPv6). DNS is re-checked **at connect time** to defeat rebinding. Redirects are never followed, and timeouts and response-size caps apply. Private hosts are allowed only through an explicit allowlist.
- **Secrets at rest**: seller credentials and webhook secrets use envelope encryption (per-secret AES-256-GCM data key, wrapped by the master key, bound to the record with AAD). Swap in a KMS for production.
- **Logging**: pino with redaction of auth headers, cookies, keys and prompts. Upstream errors are sanitized before reaching buyers (no URLs, IPs or keys).
- **Data retention**: prompts and completions are **not stored by default**. Organizations can opt in to secret-redacted prompt retention for 7 or 30 days (used for replay). Request metadata retention is configurable (7–365 days). Account and organization deletion are available.
- **Webhooks**: `Nexovra-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")` with a 5-minute tolerance. Deliveries are claimed with `SKIP LOCKED` and retried with backoff (30 s → 6 h).
- **Payments**: a Stripe credit is applied **only** from a signature-verified webhook, and is idempotent per Checkout session. The redirect back from Stripe never credits an account.

---

## What is real, what is demo, what needs credentials

**Implemented and verified by automated tests**

- Email/password auth, sessions, CSRF, RBAC teams, projects, audit log.
- Google OAuth/OIDC flow logic (PKCE, state, nonce, ID-token verification, linking rules). Tests stub the Google token endpoint.
- API keys (hash-only storage, show once, rotate, revoke, limits, expiry).
- The routing engine, all five modes, eligibility rules, failover, the health backoff ladder, recovery probes, request traces, idempotency.
- Exactly-once billing ledger, holds, fees, seller earnings, usage rollups, the reconciliation script.
- Smart Budget Guard (key, daily, monthly, per-request and per-task limits; alerts) and Agent Mode cost caps.
- The OpenAI-compatible provider adapter (tested end to end against a local mock upstream: non-streaming, streaming, auth, errors).
- Seller endpoints with SSRF protection, encrypted credentials, model discovery, verifiable mapping, validation-gated activation.
- Signed webhooks with retries and delivery logs; the in-app alert center; unusual-usage detection.
- Model Arena (with consent), Model Match Assistant, the benchmark harness, Cost Optimizer (approval required), reliability score.

**Demo-only (clearly labelled in the UI, enabled by `DEMO_MODE` / `BILLING_MODE=demo`)**

- **Demo adapter**: synthetic responses prefixed with a notice. No AI model is called. Seeded sellers ("… (synthetic)") use it.
- **Catalog baseline prices** are illustrative reference values, not provider quotes. Model capabilities are "declared" from public model docs, not verified.
- **Demo credits** (sign-up credit, "Add demo credit") are not money.
- **Seeded traffic and benchmarks** were produced by sending real requests through the pipeline to demo endpoints, then spreading the timestamps over 14 days. Analytics report the demo share.

**Production integrations still required**

- **Google OAuth credentials** (the code is complete; a real round trip needs your client ID and secret).
- **Stripe**: Checkout and webhook verification are implemented over the REST API but have not been exercised against a live Stripe account. Set `BILLING_MODE=stripe` and the keys, then test in Stripe test mode.
- **Payout provider**: payout requests reserve seller funds and are recorded, but **no money is transferred**. An admin records the outcome (`POST /api/admin/payouts/:id`, `PAID` requires an external reference).
- **Real seller supply**: connect any OpenAI-compatible endpoint (vLLM, TGI, Ollama behind HTTPS, hosted providers) on the Seller page. Nexovra can't attest that a seller serves the exact model it advertises.
- **Email delivery**: email verification and member invitations by email are not implemented. Members must already have an account.
- **Redis** in production, a **KMS** for the master key, and TLS termination and backups.
- Embeddings, image, audio and video API routes are not implemented. Those models are listed as catalog-only.

---

## Project structure

```text
├── src/                       React SPA (Vite + TypeScript + Tailwind)
│   ├── app/                   App, router (lazy routes), providers, error pages
│   ├── components/{ui,layout,charts,marketplace}
│   ├── features/              auth, home, models, calculator, docs, analytics, pricing, community, status,
│   │                          legal, dashboard, api-keys, usage, billing, routing, alerts, playground,
│   │                          sellers, teams, settings
│   ├── hooks/ lib/ services/ types/ styles/
├── server/
│   ├── src/
│   │   ├── config/            env validation
│   │   ├── routes/            auth, public, v1, apiKeys, usage, billing, routing, playground, sellers, teams, settings, alerts, admin
│   │   ├── middleware/        session, CSRF, org/RBAC, API-key auth, rate limiting, errors
│   │   ├── services/          inference pipeline, budgets, Google OAuth, catalog, analytics, stats, reliability,
│   │   │                      offer validation & health, events, webhooks, workers, model match, optimizer, benchmark
│   │   ├── providers/         adapter interface, openai_compatible, demo, registry
│   │   ├── routing/           engine (pure), candidates, policy, token estimation
│   │   ├── billing/           ledger (holds, settlement, credits, payouts), Stripe
│   │   ├── security/          crypto (envelope), API keys, passwords, SSRF-safe fetch, redaction, webhook signatures
│   │   └── scripts/           seed data, ledger reconciliation
│   └── tests/{unit,integration}
├── prisma/                    schema.prisma, migrations/, seed.ts
├── tests/{unit,e2e}           frontend unit tests, Playwright specs
├── scripts/local-db.mjs       embedded PostgreSQL for development
├── docker-compose.yml, Dockerfile, .env.example
```
