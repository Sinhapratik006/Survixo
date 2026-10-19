import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui';
import { Code, DocSection, DocTable } from './docsKit';
import {
  basicChat,
  errorHandling,
  exampleError,
  exampleWebhook,
  exampleWebhookHeaders,
  idempotency,
  rawHeaders,
  routingOptions,
  streamingChat,
  webhookVerification,
} from './samples';
import type { DocsCtx } from './sectionsBasics';

const link = 'font-medium text-brand-700 hover:underline dark:text-brand-300';

type ErrorRow = [status: string, code: string, meaning: ReactNode, action: ReactNode];

const ERROR_ROWS: ErrorRow[] = [
  ['400', 'invalid_json', 'The body is not valid JSON.', 'Fix the JSON encoding.'],
  ['400', 'invalid_request', 'The body failed validation (details.issues lists up to 10 problems), an unknown key was sent inside nexovra, or X-Min-Discount is not 0–100.', 'Correct the field named in the message.'],
  ['400', 'validation_error', 'Dashboard API (/api/*) body or query failed validation. /v1 uses invalid_request instead.', 'Correct the field named in the message.'],
  ['400', 'unsupported_parameter', 'n is not 1.', 'Send n = 1 (or omit it) and make parallel requests instead.'],
  ['400', 'invalid_routing_mode', 'X-Nexovra-Routing is not a known mode.', 'Use lowest_cost, balanced, quality_first, preferred_provider or custom.'],
  ['400', 'invalid_policy', 'policy_id does not belong to your organization.', 'Check the policy id in Dashboard → Routing.'],
  ['400', 'unsupported_model', 'The model is in the catalog but not served through chat completions.', 'Pick a model from GET /v1/models.'],
  ['400', 'upstream_rejected_request', 'The seller rejected the request as invalid (e.g. an unsupported parameter or feature). Not retried; not billed.', 'Adjust the request; check required capabilities.'],
  ['401', 'missing_api_key', 'No bearer token.', 'Send Authorization: Bearer nxv_…'],
  ['401', 'invalid_api_key', 'Malformed or unknown key.', 'Check for truncation or whitespace; create a new key if lost.'],
  ['401', 'api_key_revoked', 'The key was revoked or rotated.', 'Use the replacement key.'],
  ['401', 'api_key_expired', 'The key’s expiry date passed.', 'Create a new key or extend the expiry.'],
  ['402', 'insufficient_balance', 'The available balance cannot cover the worst-case hold (details.required_hold_usd, available_usd).', 'Add funds or lower max_tokens.'],
  ['402', 'max_cost_too_low', 'max_cost_usd or the per-request budget cannot cover the prompt plus 16 output tokens on any eligible offer.', 'Raise the cap or shorten the prompt.'],
  ['402', 'key_spend_limit_exceeded', 'The key’s spend limit would be exceeded.', 'Raise the key limit or use another key.'],
  ['402', 'request_budget_exceeded', 'The hold exceeds a hard per-request budget.', 'Lower max_tokens or raise the limit.'],
  ['402', 'daily_budget_exceeded', 'A hard daily budget would be exceeded.', 'Wait for the next UTC day or raise the limit.'],
  ['402', 'monthly_budget_exceeded', 'A hard monthly budget would be exceeded.', 'Wait for the next UTC month or raise the limit.'],
  ['402', 'task_budget_exceeded', 'The per-task budget for this task_id would be exceeded.', 'Raise the limit or end the task.'],
  ['404', 'model_not_found', 'No catalog model or alias matches.', 'List models with GET /v1/models.'],
  ['404', 'no_offers_for_model', 'No seller currently offers this model.', 'Try another model or "auto".'],
  ['404', 'request_not_found', 'GET /v1/requests/{id}: unknown id, or the request was made with another key.', 'Query with the key that made the request, or use the dashboard.'],
  ['404', 'not_found', 'Unknown endpoint.', 'Check the path and method.'],
  ['409', 'idempotency_conflict', 'A request with this Idempotency-Key exists (details.original_request_id, original_status). Not executed or billed again.', 'Fetch the original with GET /v1/requests/{id}; use a new key for a new request.'],
  ['413', 'payload_too_large', 'The body exceeds 2 MB.', 'Shrink the prompt or images.'],
  ['429', 'rate_limited', 'A rate limit was exceeded (details.limit, window_seconds).', 'Wait for Retry-After seconds, then retry with backoff.'],
  ['500', 'internal_error', 'Unexpected server error.', 'Retry later; contact support with x-request-id.'],
  ['502', 'upstream_unavailable', 'Every eligible offer failed (details.attempts). Not billed.', 'Retry with backoff; relax routing constraints.'],
  ['503', 'no_eligible_offer', 'Offers exist but none satisfies the constraints (details.rejected lists reasons).', 'Inspect the reasons; relax constraints or policy.'],
  ['—', 'stream_interrupted', 'In-stream error event after output started (HTTP 200 already sent). Delivered tokens billed.', 'Retry if you need the full answer.'],
  ['—', 'client_disconnected', 'Recorded on the request when your client disconnected. Delivered tokens billed.', 'Keep the connection open until [DONE].'],
];

export function ErrorsSection({ ctx }: { ctx: DocsCtx }) {
  return (
    <DocSection id="errors" title="Errors" lead="The /v1 API returns errors in the OpenAI error envelope with a stable machine-readable code.">
      <Code language="json" code={exampleError} title="Error response" />
      <ul>
        <li>
          <code>param</code> is always <code>null</code>. <code>details</code> is present when there is extra context; errors raised after a request was recorded include{' '}
          <code>details.request_id</code>.
        </li>
        <li>
          <code>type</code> is derived from the status: 401 → <code>authentication_error</code>, 402 → <code>insufficient_quota</code>, 429 → <code>rate_limit_error</code>, 5xx →{' '}
          <code>api_error</code>, otherwise <code>invalid_request_error</code>.
        </li>
        <li>
          Errors inside a stream are sent as <code>{'data: {"error": {...}}'}</code> followed by <code>[DONE]</code>.
        </li>
      </ul>
      <DocTable
        caption="Error codes"
        minWidth={760}
        head={['HTTP', 'Code', 'Meaning', 'What to do']}
        rows={ERROR_ROWS.map(([status, code, meaning, action]) => [status, <code>{code}</code>, meaning, action])}
      />
      <h3>Handling errors with the SDKs</h3>
      <Code samples={errorHandling(ctx.apiBaseUrl)} />
    </DocSection>
  );
}

export function RateLimitsSection() {
  return (
    <DocSection id="rate-limits" title="Rate limits" lead="Fixed one-minute windows unless noted. Several limiters can apply to the same request; the first one exceeded returns 429.">
      <DocTable
        caption="API rate limits"
        minWidth={600}
        head={['Scope', 'Limit', 'Key']}
        rows={[
          [<code>/v1/*</code>, '1,200 requests / 60 s', 'Client IP (checked before authentication)'],
          [<code>/v1/*</code>, 'Key’s RPM limit, default 600 / 60 s', 'API key'],
          [<code>/v1/*</code>, '3,000 requests / 60 s', 'Organization (all keys combined)'],
          [
            <>
              <code>/api/*</code> (dashboard)
            </>,
            '600 / 60 s per IP and 600 / 60 s per signed-in user', 'IP, user'],
          ['Sign-up, sign-in, Google sign-in', '10 / 60 s', 'IP'],
          ['Password sign-in', '8 / 15 min', 'Email address'],
          ['Endpoint verification and offer validation', '10 / 60 s', 'User'],
          ['Request replay (dashboard)', '20 / 60 s', 'User'],
          ['Private benchmark runs', '6 / hour', 'User'],
          ['Demo credit grants', '10 / hour', 'User'],
          ['Payout requests', '5 / hour', 'User'],
        ]}
      />
      <ul>
        <li>
          Responses carry <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code> and <code>RateLimit-Reset</code> (seconds until the window resets). Because several limiters
          run, the headers reflect the last limiter evaluated (on <code>/v1</code> usually the organization limiter).
        </li>
        <li>
          A 429 response has code <code>rate_limited</code>, a <code>Retry-After</code> header, and a message naming the limiter (e.g. <code>v1-key</code>) with{' '}
          <code>details.limit</code> and <code>details.window_seconds</code>.
        </li>
        <li>Windows are aligned to clock boundaries, so a burst can straddle two windows.</li>
        <li>Seller capacity (offer concurrency, RPM and daily caps) does not produce 429s; it makes offers ineligible, which can lead to no_eligible_offer.</li>
        <li>If the rate-limit store is unavailable, limits fail open so the API stays available.</li>
      </ul>
    </DocSection>
  );
}

export function SdksSection({ ctx }: { ctx: DocsCtx }) {
  const base = ctx.apiBaseUrl;
  return (
    <DocSection
      id="sdks"
      title="SDKs & examples"
      lead="Use the official OpenAI SDKs (Python openai, JavaScript/TypeScript openai) or any HTTP client. Only the base URL and API key change."
    >
      <Alert tone="info" className="mb-6">
        Python: pass Nexovra options with <code>extra_body={'{"nexovra": {...}}'}</code> and headers with <code>extra_headers</code>; read the <code>nexovra</code> object with{' '}
        <code>completion.model_dump()["nexovra"]</code>. TypeScript: extra body fields are sent as-is; cast the response to read <code>nexovra</code>.
      </Alert>
      <h3>Basic chat</h3>
      <Code samples={basicChat(base)} />
      <h3>Streaming</h3>
      <Code samples={streamingChat(base)} />
      <h3>Routing options</h3>
      <Code samples={routingOptions(base)} />
      <h3>Idempotent requests</h3>
      <Code samples={idempotency(base)} />
      <p>
        The official SDKs retry some failures (including 409, 429 and 5xx) automatically with the same headers. With an <code>Idempotency-Key</code>, a retried request would
        receive <code>409 idempotency_conflict</code>, so the examples disable SDK retries.
      </p>
      <h3>Reading Nexovra metadata and headers</h3>
      <Code samples={rawHeaders(base)} />
    </DocSection>
  );
}

const EVENTS: Array<[string, string, string]> = [
  ['budget.threshold', 'A budget alert threshold was crossed (daily or monthly).', 'threshold, period, spent_usd, limit_usd, project_id'],
  ['offer.failed', 'Seller side: one of your offers was taken out of routing after a failed live request or health probe.', 'offer_id, model_id, error_kind, consecutive_failures (probe failures: offer_id, model_id)'],
  ['provider.down', 'Every eligible offer failed for one of your requests. Nothing was billed.', 'request_id, model, failures'],
  ['usage.unusual', 'At least 50 API requests in the last hour and 5× the trailing 7-day hourly average. At most once per 6 hours.', 'last_hour, trailing_hourly_avg'],
  ['key.revoked', 'An API key was revoked manually or by rotation.', 'key_id, name, reason'],
  ['payout.updated', 'A payout was requested or its status changed.', 'payout_id, status (amount_usd when requested)'],
  ['test.ping', 'Sent when you trigger a test delivery from the dashboard.', '(empty)'],
];

export function WebhooksSection() {
  return (
    <DocSection id="webhooks" title="Webhooks" lead="Subscribe HTTPS endpoints to account events. Every delivery is signed so you can verify it came from Nexovra.">
      <p>
        Manage endpoints in{' '}
        <Link to="/dashboard/alerts" className={link}>
          Dashboard → Alerts & webhooks
        </Link>{' '}
        (requires <code>webhooks:manage</code>: Owner, Admin or Developer). Each organization can have up to 10 endpoints. The URL must pass the same outbound safety checks as
        seller endpoints (HTTPS, public address). The signing secret (<code>whsec_…</code>) is shown once on creation and on rotation. Every event except test pings also creates
        an in-app notification.
      </p>
      <h3>Events</h3>
      <DocTable
        caption="Webhook events"
        minWidth={700}
        head={['Event', 'When', 'data fields']}
        rows={EVENTS.map(([name, when, data]) => [<code>{name}</code>, when, <span className="text-xs">{data}</span>])}
      />
      <h3>Payload and headers</h3>
      <Code language="http" code={exampleWebhookHeaders} title="Delivery request" />
      <Code language="json" code={exampleWebhook} title="Body" />
      <p>
        The body is <code>{'{id, type, created_at, org_id, title, body, data}'}</code>. <code>id</code> is the delivery id and equals the <code>Nexovra-Delivery-Id</code> header;
        it stays the same across retries of that delivery, so use it to discard duplicates.
      </p>
      <h3>Verifying signatures</h3>
      <p>
        The <code>Nexovra-Signature</code> header has the form <code>{'t=<unix seconds>,v1=<hex>'}</code>, where <code>v1</code> is the HMAC-SHA256 of{' '}
        <code>{'"<t>.<raw body>"'}</code> using your full signing secret (including the <code>whsec_</code> prefix) as the key. Compute it over the raw request body, compare in
        constant time, and reject timestamps more than 300 seconds from your clock. The timestamp is generated at each delivery attempt.
      </p>
      <Code samples={webhookVerification} />
      <h3>Delivery and retries</h3>
      <ul>
        <li>Deliveries are POSTed with a 10-second timeout. Any 2xx response counts as success; redirects are not followed and count as failures.</li>
        <li>Failed deliveries are retried after 30 s, 2 min, 10 min, 1 h and 6 h (6 attempts in total). After the last failure the delivery is marked failed.</li>
        <li>Disabled endpoints receive no deliveries; pending deliveries to them are marked failed.</li>
        <li>
          The dashboard shows the last 50 deliveries per endpoint with response status and error, and lets you retry a delivery manually (it restarts the attempt count) or send a
          test event.
        </li>
        <li>Delivery logs are kept for 30 days.</li>
      </ul>
      <Alert tone="warning" title="Respond quickly">
        Return a 2xx as soon as the signature is verified and process the event asynchronously; handlers slower than 10 seconds time out and the delivery is retried.
      </Alert>
    </DocSection>
  );
}
