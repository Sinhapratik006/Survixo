import { Link } from 'react-router-dom';
import { Alert, CopyButton, DemoBadge } from '@/components/ui';
import { Code, DocSection, DocTable, Endpoint, type useDocsConfig } from './docsKit';
import { basicChat, envVarSamples, exampleCompletion, exampleModels, exampleStream, exampleStreamError, listModels, streamingChat } from './samples';

export type DocsCtx = ReturnType<typeof useDocsConfig>;

export function GettingStartedSection({ ctx }: { ctx: DocsCtx }) {
  return (
    <DocSection
      id="getting-started"
      title="Getting started"
      lead="Nexovra exposes one OpenAI-compatible API. You send a standard chat completion request; the routing engine picks an eligible seller offer for the model under your policies and budgets, reserves funds, calls the seller, and bills the actual usage."
    >
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-white px-4 py-3 dark:border-navy-600 dark:bg-navy-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Base URL</span>
        <code className="break-all">{ctx.apiBaseUrl}</code>
        <CopyButton value={ctx.apiBaseUrl} label="Copy base URL" />
      </div>
      <p>
        Point any OpenAI SDK or HTTP client at this base URL and authenticate with a Nexovra API key. The fastest path is the{' '}
        <Link to="/docs/quickstart" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
          Quickstart
        </Link>
        .
      </p>
      <h3>Endpoints</h3>
      <DocTable
        caption="Public API endpoints"
        head={['Endpoint', 'Purpose']}
        rows={[
          [<Endpoint method="GET" path="/v1/models" />, 'List models available through the chat completions API.'],
          [<Endpoint method="GET" path="/v1/models/{id}" />, 'Get one model by catalog id or alias.'],
          [<Endpoint method="POST" path="/v1/chat/completions" />, 'Create a chat completion (non-streaming or streaming).'],
          [<Endpoint method="GET" path="/v1/balance" />, 'Available balance, held funds and the calling key’s spend.'],
          [<Endpoint method="GET" path="/v1/usage?days=N" />, 'Daily usage for the calling key (1–90 days).'],
          [<Endpoint method="GET" path="/v1/requests/{id}" />, 'Request record, routing trace and attempts (requests made with the calling key).'],
        ]}
      />
      <p>
        Only chat completions are served. Embeddings, image generation, the legacy completions endpoint and <code>n &gt; 1</code> are not implemented. Catalog entries
        for other modalities are listed for reference; requesting them returns <code>unsupported_model</code>.
      </p>

      <h3>Demo features and production integrations</h3>
      {ctx.demoMode && (
        <Alert tone="demo" title="This server runs in demo mode" className="mb-4">
          Demo offers use a synthetic adapter: no AI model is called and every response starts with a visible demo notice. Demo prices, demo offers and demo credits are
          illustrative. Routing, holds, billing, traces and webhooks run exactly as they would for live offers.
        </Alert>
      )}
      <DocTable
        caption="Demo-only features and production requirements"
        head={['Area', 'Demo behaviour', 'Production requirement']}
        rows={[
          [
            <span className="inline-flex items-center gap-2">
              Demo adapter <DemoBadge label="Demo" />
            </span>,
            'Synthetic responses generated locally; seeded demo offers.',
            <>
              Disabled: <code>DEMO_MODE=false</code> is required in production, and demo offers are then excluded from routing.
            </>,
          ],
          [
            'Funding',
            'Labelled demo credits (not real money).',
            <>
              Stripe Checkout: <code>BILLING_MODE=stripe</code>, <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>. Demo billing cannot run in production.
            </>,
          ],
          [
            'Google sign-in',
            'Hidden unless configured.',
            <>
              <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (both or neither).
            </>,
          ],
          ['Seller payouts', 'Requests are recorded and funds reserved.', 'No payout provider is integrated; an operator must process payouts manually.'],
          [
            'Rate limits and counters',
            <>
              In-memory store (single process) when <code>REDIS_URL</code> is unset.
            </>,
            <>
              <code>REDIS_URL</code> is required in production.
            </>,
          ],
        ]}
      />

      <h3>Dashboard API</h3>
      <p>
        The <code>/api/*</code> endpoints power the Nexovra web app. They use cookie sessions with CSRF protection, may change without notice and are{' '}
        <strong>not a public contract</strong>. Integrate only with the <code>/v1</code> API described here.
      </p>
    </DocSection>
  );
}

export function AuthenticationSection() {
  return (
    <DocSection id="authentication" title="Authentication" lead="Every /v1 request is authenticated with an API key sent as a bearer token.">
      <Code language="http" code={'Authorization: Bearer nxv_<40 base62 characters>'} title="Request header" />
      <ul>
        <li>
          Keys have the format <code>nxv_</code> followed by exactly 40 characters from <code>[0-9A-Za-z]</code>. Anything else is rejected without a database lookup.
        </li>
        <li>A key belongs to one organization. Optionally it is assigned to a project, which applies that project’s routing policy and budget.</li>
        <li>
          The <code>/v1</code> API does not use cookies and does not send CORS headers. Call it from your backend, never from browser or mobile code.
        </li>
      </ul>
      <DocTable
        caption="Authentication errors"
        head={['Status', 'Code', 'Meaning']}
        rows={[
          ['401', <code>missing_api_key</code>, 'No Authorization: Bearer header.'],
          ['401', <code>invalid_api_key</code>, 'Malformed key, or no key with this value exists.'],
          ['401', <code>api_key_revoked</code>, 'The key was revoked (manually or by rotation).'],
          ['401', <code>api_key_expired</code>, 'The key’s expiry date has passed.'],
        ]}
      />
    </DocSection>
  );
}

export function ApiKeysSection() {
  return (
    <DocSection id="api-keys" title="API keys" lead="Create and manage keys in the dashboard. A key’s secret is shown exactly once.">
      <ol>
        <li>
          Open{' '}
          <Link to="/dashboard/api-keys" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            Dashboard → API keys
          </Link>{' '}
          (requires the <code>keys:manage</code> permission: Owner, Admin or Developer).
        </li>
        <li>Choose a name and, optionally, a project, a spend limit (USD), a requests-per-minute limit (1–10,000) and an expiry date.</li>
        <li>Copy the secret immediately and store it in a secret manager or server-side environment variable.</li>
      </ol>
      <Code samples={envVarSamples} />
      <DocTable
        caption="API key properties"
        head={['Property', 'Behaviour']}
        rows={[
          ['Storage', 'Only a keyed HMAC-SHA256 of the key (with a server-side pepper) is stored. The plaintext cannot be recovered; lose it and you must rotate.'],
          [
            'Display',
            <>
              Masked as the first 10 characters and last 4, e.g. <code>nxv_a1B2c3…wXyZ</code>.
            </>,
          ],
          [
            'Spend limit',
            <>
              Checked before dispatch against the key’s lifetime spend plus the request’s worst-case hold (<code>key_spend_limit_exceeded</code>).
            </>,
          ],
          ['Rate limit', 'Per-key requests per minute; 600/min when not set.'],
          [
            'Rotation',
            <>
              Issues a new key with the same settings and revokes the old one immediately (no grace period). Emits <code>key.revoked</code>.
            </>,
          ],
          ['Limits', 'At most 50 active keys per organization.'],
        ]}
      />
      <Alert tone="warning" title="Never put keys in frontend code">
        Anyone who can read a key can spend your balance. Keep keys on the server, scope them with spend limits, and rotate immediately if one leaks.
      </Alert>
    </DocSection>
  );
}

export function ModelsSection({ ctx }: { ctx: DocsCtx }) {
  return (
    <DocSection
      id="models"
      title="Models"
      lead="The catalog lists models with their declared capabilities, a baseline reference price and the best currently routable offer."
    >
      <Code samples={listModels(ctx.apiBaseUrl)} />
      <Code language="json" code={exampleModels} title="GET /v1/models response" />
      <DocTable
        caption="Model fields"
        head={['Field', 'Meaning']}
        rows={[
          [
            <code>id</code>,
            <>
              Catalog id to use as <code>model</code>. Aliases (e.g. <code>meta-llama/llama-3.1-8b-instruct</code>) are also accepted. Chat requests match ids
              case-insensitively; <code>GET /v1/models/{'{id}'}</code> expects the exact id (aliases still match case-insensitively).
            </>,
          ],
          [<code>owned_by</code>, 'Model provider id (e.g. meta). This is not the seller serving it.'],
          [<code>created</code>, 'Always 0 (not tracked).'],
          [<code>nexovra.capabilities</code>, <>Each capability with status <code>declared</code> (from catalog sources) or <code>verified</code>. See <a href="#capabilities">capabilities</a>.</>],
          [<code>nexovra.baseline_price_usd_per_m</code>, 'Reference list price per 1M tokens used to estimate savings. demo: true marks illustrative prices.'],
          [<code>nexovra.best_offer_usd_per_m</code>, 'Cheapest healthy, validated, active offer (by blended price: 75% input, 25% output). null when none.'],
          [<code>nexovra.healthy_offers</code>, 'Number of routable offers that are not marked unhealthy.'],
        ]}
      />
      <p>
        Only models available through the chat API are listed. Catalog data is cached for up to 20 seconds. Browse the catalog with live market data on the{' '}
        <Link to="/models" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
          Models
        </Link>{' '}
        page. Use <code>"model": "auto"</code> to let the router choose across models (see <a href="#agent-mode">Agent mode</a>).
      </p>
    </DocSection>
  );
}

export function RequestsSection({ ctx }: { ctx: DocsCtx }) {
  return (
    <DocSection id="requests" title="API request format" lead="POST /v1/chat/completions accepts the OpenAI chat completions body plus an optional nexovra extension object.">
      <Code samples={basicChat(ctx.apiBaseUrl)} />
      <h3>Body parameters</h3>
      <DocTable
        caption="Chat completion body parameters"
        minWidth={640}
        head={['Parameter', 'Type / limits', 'Notes']}
        rows={[
          [<code>model</code>, 'string, required', <>Catalog id, alias, or <code>auto</code>.</>],
          [
            <code>messages</code>,
            '1–1000 messages',
            <>
              Roles <code>system</code>, <code>user</code>, <code>assistant</code>, <code>tool</code>, <code>developer</code>. Content is a string, null, or up to 100 parts of
              type <code>text</code> or <code>image_url</code>.
            </>,
          ],
          [
            <>
              <code>max_tokens</code> / <code>max_completion_tokens</code>
            </>,
            'positive integer',
            <>
              <code>max_tokens</code> wins if both are set. Default: min(4096, model max output). Values above the model’s max output are clamped (not applied for{' '}
              <code>auto</code>).
            </>,
          ],
          [<code>temperature</code>, '0–2', 'Forwarded.'],
          [<code>top_p</code>, '0–1', 'Forwarded.'],
          [<code>stop</code>, 'string or up to 4 strings (≤200 chars each)', 'Forwarded.'],
          [<code>seed</code>, 'integer', 'Forwarded.'],
          [
            <>
              <code>tools</code>, <code>tool_choice</code>
            </>,
            'up to 128 tools',
            <>
              Forwarded. A non-empty <code>tools</code> adds the <code>tools</code> capability requirement.
            </>,
          ],
          [
            <code>response_format</code>,
            <>
              <code>text</code> | <code>json_object</code> | <code>json_schema</code>
            </>,
            <>
              Forwarded. Non-text formats add the <code>json_mode</code> requirement.
            </>,
          ],
          [<code>stream</code>, 'boolean', <>See <a href="#streaming">Streaming</a>.</>],
          [<code>stream_options</code>, 'object', 'Accepted; the final usage chunk is always sent when streaming.'],
          [
            <code>n</code>,
            'integer',
            <>
              Only <code>1</code> is supported; other values return <code>unsupported_parameter</code>.
            </>,
          ],
          [<code>user</code>, 'string ≤256', 'Accepted, not forwarded.'],
          [<code>nexovra</code>, 'object', <>Routing and cost options. See <a href="#routing">Routing</a>. Unknown keys inside it are rejected.</>],
        ]}
      />
      <p>
        Other OpenAI parameters (for example <code>frequency_penalty</code>, <code>presence_penalty</code>, <code>logprobs</code>) are accepted but{' '}
        <strong>not forwarded</strong> to sellers. The maximum request body is 2 MB.
      </p>

      <h3>Request headers</h3>
      <DocTable
        caption="Request headers"
        head={['Header', 'Notes']}
        rows={[
          [<code>Authorization</code>, <>Required. <code>Bearer nxv_…</code></>],
          [<code>Content-Type</code>, <code>application/json</code>],
          [<code>Idempotency-Key</code>, <>Optional, up to 200 characters (longer values are truncated). See <a href="#usage-billing">idempotency</a>.</>],
          [
            <code>X-Nexovra-Routing</code>,
            <>
              Routing mode, used only when <code>nexovra.routing_mode</code> is absent. Unknown values return <code>invalid_routing_mode</code>.
            </>,
          ],
          [<code>X-Min-Discount</code>, <>0–100. Combined with <code>nexovra.min_discount_pct</code>; the stricter value wins.</>],
          [<code>X-Nexovra-Task-Id</code>, <>Up to 128 characters; used when <code>nexovra.task_id</code> is absent.</>],
        ]}
      />

      <h3>Response</h3>
      <Code language="json" code={exampleCompletion} title="200 OK" />
      <DocTable
        caption="nexovra response object"
        minWidth={600}
        head={['Field', 'Type', 'Meaning']}
        rows={[
          [<code>request_id</code>, 'string', <>Nexovra request id (<code>req_…</code>). Use it with <code>GET /v1/requests/{'{id}'}</code>.</>],
          [<code>model</code>, 'string', <>Catalog model that served the request (useful with <code>auto</code>).</>],
          [<code>offer_id</code>, 'string', 'Seller offer that served the request.'],
          [<code>seller</code>, 'string', 'Seller organization name.'],
          [<code>demo</code>, 'boolean', 'true when a synthetic demo offer served the request.'],
          [<code>routing_mode</code>, 'string', 'Effective routing mode.'],
          [<code>routing_reason</code>, 'string', 'Human-readable explanation of the routing decision.'],
          [<code>retries</code>, 'number', 'Additional offers tried after the first.'],
          [<code>cost_usd</code>, 'number', 'Amount charged to your balance.'],
          [<code>baseline_cost_usd</code>, 'number | null', 'The same tokens priced at the model’s baseline reference price.'],
          [<code>estimated_savings_usd</code>, 'number | null', 'baseline_cost_usd − cost_usd. Can be negative.'],
          [<code>usage_estimated</code>, 'boolean', 'true when the seller did not report usage and tokens were estimated (~4 characters per token).'],
          [<code>latency_ms</code>, 'number', 'Total server-side time including routing and failover.'],
        ]}
      />
      <DocTable
        caption="Response headers"
        head={['Header', 'Notes']}
        rows={[
          [<code>x-nexovra-request-id</code>, 'Nexovra request id (non-streaming and streaming).'],
          [<code>x-nexovra-cost-usd</code>, 'Charged amount with 6 decimals (non-streaming only).'],
          [<code>x-nexovra-offer-id</code>, 'Serving offer (streaming only).'],
          [<code>x-request-id</code>, 'HTTP log id for support; different from the Nexovra request id.'],
          [
            <>
              <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code>, <code>RateLimit-Reset</code>
            </>,
            <>
              See <a href="#rate-limits">rate limits</a>.
            </>,
          ],
        ]}
      />
      <p>
        The response <code>model</code> is the catalog id, even if you requested an alias. Prompt tokens are estimated before dispatch (about 4 characters per token, plus
        1,000 per image) for routing and holds; billing uses the seller-reported usage when available.
      </p>
    </DocSection>
  );
}

export function StreamingSection({ ctx }: { ctx: DocsCtx }) {
  return (
    <DocSection id="streaming" title="Streaming" lead='Set "stream": true to receive Server-Sent Events in the OpenAI chunk format, terminated by data: [DONE].'>
      <Code samples={streamingChat(ctx.apiBaseUrl)} />
      <Code language="text" code={exampleStream} title="Event stream" />
      <ul>
        <li>
          The HTTP status and headers are sent when the first token arrives. Errors before that (validation, budgets, balance, all offers failing) are returned as normal JSON
          error responses with their HTTP status.
        </li>
        <li>Failover to another offer happens only before the first token. Once output has been sent, the request is never retried on another offer.</li>
        <li>
          The final chunk always has empty <code>choices</code>, the <code>usage</code> totals and the <code>nexovra</code> object, whether or not you set{' '}
          <code>stream_options.include_usage</code>.
        </li>
        <li>
          Streaming requests are only routed to offers whose streaming support passed validation. Streaming responses include <code>x-nexovra-request-id</code> and{' '}
          <code>x-nexovra-offer-id</code> headers; the cost is in the final chunk.
        </li>
      </ul>
      <h3>Interrupted streams and disconnects</h3>
      <p>If the seller’s stream breaks after output was delivered, you receive an error event and the stream ends:</p>
      <Code language="text" code={exampleStreamError} title="Error event" />
      <p>
        Delivered output is billed: output tokens are estimated from the text sent (about 4 characters per token), input tokens from the prompt estimate, never above the
        reserved hold. The request is recorded with error code <code>stream_interrupted</code>. If your client disconnects mid-stream, delivered tokens are billed the same way
        and the request is recorded with <code>client_disconnected</code>. OpenAI SDKs raise an API error when they receive an error event.
      </p>
    </DocSection>
  );
}

export function CapabilitiesSection() {
  return (
    <DocSection
      id="capabilities"
      title="Provider capabilities & adapter layer"
      lead="Sellers connect through adapters. What Nexovra checks itself is kept separate from what catalog sources declare."
    >
      <h3>Adapters</h3>
      <DocTable
        caption="Adapters"
        minWidth={620}
        head={['', 'openai_compatible', 'demo']}
        rows={[
          [
            'Upstream',
            <>
              Seller’s HTTPS endpoint implementing <code>GET /models</code> and <code>POST /chat/completions</code>.
            </>,
            'Local synthetic generator. No AI model is called.',
          ],
          ['Availability', 'Always.', <>Only when <code>DEMO_MODE=true</code>.</>],
          ['Authentication', 'Bearer API key, encrypted at rest.', 'None.'],
          [
            'Streaming',
            <>
              Yes (requests <code>stream_options.include_usage</code> upstream).
            </>,
            'Yes.',
          ],
          ['Tools, vision, JSON mode', 'Passed through to the upstream.', 'JSON mode only. Requests needing tools or vision are never routed to demo offers.'],
          [
            'Usage',
            <>
              Seller-reported usage; estimated if missing (<code>usage_estimated: true</code>).
            </>,
            'Synthetic counts from the ~4 characters per token heuristic, reported as usage.',
          ],
          ['Response size limits', '4 MB JSON, 16 MB per stream.', '—'],
        ]}
      />
      <Alert tone="demo" title="Demo responses are synthetic" className="mb-6">
        Every demo response starts with “[Demo response - synthetic text, no AI model was called]”. Demo endpoints simulate latency and failures and answer simple arithmetic
        with a configured accuracy so benchmarks and failover can be exercised. Check <code>nexovra.demo</code> in responses.
      </Alert>
      <h3>Verified vs declared</h3>
      <DocTable
        caption="What is verified and what is declared"
        minWidth={620}
        head={['Item', 'How it is established']}
        rows={[
          [
            'Model capabilities (chat, tools, vision, json_mode, streaming, …)',
            <>
              Declared by catalog sources (status <code>declared</code>) unless marked <code>verified</code>.
            </>,
          ],
          [
            'Endpoint serves the model name',
            <>
              Verified: the upstream model name must appear in <code>GET {'{baseUrl}'}/models</code>.
            </>,
          ],
          ['Offer answers chat requests', 'Verified by a live test completion during validation.'],
          ['Offer supports streaming', 'Verified by a live streaming test during validation.'],
          [
            'Tools, vision, JSON mode for a specific offer',
            <>
              Not verified. Routing requires the model to declare the capability and the adapter to support it; the seller may still reject it, which returns{' '}
              <code>upstream_rejected_request</code>.
            </>,
          ],
          ['Latency, success rate, reliability', 'Measured from live request attempts and health checks.'],
          ['Quality', <>Measured only through published benchmark results (see <a href="#benchmarks">benchmarks</a>).</>],
          ['Which model weights actually produced a response', 'Not attested. See security.'],
        ]}
      />
    </DocSection>
  );
}

