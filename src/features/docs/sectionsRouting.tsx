import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui';
import { Code, DocSection, DocTable } from './docsKit';
import { accountEndpoints, agentMode, exampleBalance, exampleRequestTrace, exampleUsage, routingOptions } from './samples';
import type { DocsCtx } from './sectionsBasics';

const link = 'font-medium text-brand-700 hover:underline dark:text-brand-300';

export function RoutingSection({ ctx }: { ctx: DocsCtx }) {
  return (
    <DocSection
      id="routing"
      title="Routing"
      lead="For every request the engine loads all offers for the model, removes ineligible ones (recording why), ranks the rest by the routing mode, and tries them in order."
    >
      <h3>Routing modes</h3>
      <DocTable
        caption="Routing modes"
        minWidth={620}
        head={['Mode', 'Ranking']}
        rows={[
          [<code>LOWEST_COST</code>, 'Lowest estimated cost (estimated prompt tokens + max output tokens at the offer’s prices). Platform default.'],
          [<code>BALANCED</code>, '0.6 × normalized cost + 0.4 × normalized median latency. Offers without latency data get a 0.75 latency penalty.'],
          [<code>QUALITY_FIRST</code>, 'Highest model benchmark score first; models without results last. Ties broken by reliability score, then cost.'],
          [<code>PREFERRED_PROVIDER</code>, <>Offers matching <code>preferred_providers</code> first, then lowest cost.</>],
          [
            <code>CUSTOM</code>,
            'Weighted score using the policy’s weights (defaults: price 0.5, latency 0.2, quality 0.2, reliability 0.1). Unknown quality or reliability scores as worst.',
          ],
        ]}
      />
      <p>
        Mode values are case-insensitive and accept hyphens or underscores: <code>lowest_cost</code>, <code>lowest-cost</code> and <code>LOWEST_COST</code> are equivalent. Equal
        scores are ordered by lower median latency, then by offer id.
      </p>

      <h3>Selecting routing per request</h3>
      <Code samples={routingOptions(ctx.apiBaseUrl)} />
      <DocTable
        caption="nexovra request options"
        minWidth={680}
        head={['Field', 'Type / limits', 'Effect']}
        rows={[
          [<code>routing_mode</code>, 'string', 'One of the five modes. Overrides the policy mode.'],
          [<code>policy_id</code>, 'string ≤64', <>Use a stored routing policy of your organization. Unknown ids return <code>invalid_policy</code>.</>],
          [<code>max_cost_usd</code>, 'number, >0, ≤10,000', <>Per-request cost cap; see <a href="#agent-mode">Agent mode</a>.</>],
          [<code>min_discount_pct</code>, '0–100', 'Minimum estimated discount versus the baseline price. Offers of models without a baseline are excluded.'],
          [<code>max_latency_ms</code>, 'integer, 1–600,000', 'Maximum measured median latency. Offers without latency measurements are excluded.'],
          [<code>min_reliability</code>, 'integer, 0–100', 'Minimum reliability score. Offers with insufficient data are excluded.'],
          [<code>min_quality_score</code>, '0–1', 'Minimum model benchmark score. Models without benchmark results are excluded.'],
          [<code>allowed_providers</code>, 'string[] ≤50', 'Allowlist. Matches the model provider id (e.g. meta), the seller organization id or the seller slug, case-insensitively.'],
          [<code>blocked_providers</code>, 'string[] ≤50', 'Blocklist with the same matching.'],
          [<code>preferred_providers</code>, 'string[] ≤50', <>Preference list used by <code>PREFERRED_PROVIDER</code>.</>],
          [
            <code>required_capabilities</code>,
            <>
              <code>tools</code> | <code>vision</code> | <code>json_mode</code> | <code>streaming</code>, ≤10
            </>,
            'Added to the requirements derived from the request.',
          ],
          [<code>task_id</code>, 'string ≤128', <>Groups requests for <a href="#budgets">per-task budgets</a> and traces.</>],
        ]}
      />
      <p>
        Equivalent headers: <code>X-Nexovra-Routing</code> (mode, if the body does not set one), <code>X-Min-Discount</code> (stricter of header and body) and{' '}
        <code>X-Nexovra-Task-Id</code> (if the body does not set one).
      </p>

      <h3>Eligibility rules</h3>
      <p>An offer is eligible only if every rule passes. Each failed rule is recorded as a reason in the request trace.</p>
      <ul>
        <li>
          The offer is <code>ACTIVE</code>, its endpoint is <code>VERIFIED</code>, it has passed validation, and it is not marked unhealthy.
        </li>
        <li>Demo offers are allowed by the policy (and the server runs in demo mode).</li>
        <li>
          Capabilities: <code>chat</code> is always required; <code>streaming</code> when <code>stream</code> is true; <code>tools</code> when <code>tools</code> is non-empty;{' '}
          <code>json_mode</code> when <code>response_format</code> is not text; <code>vision</code> when a message contains an image. Each must be declared for the model and
          supported by the seller’s adapter; streaming must also have been verified for the offer.
        </li>
        <li>Image input requires a model that accepts image input.</li>
        <li>Estimated prompt tokens + max output tokens fit the model’s context window.</li>
        <li>Allowlist and blocklist; the policy’s maximum input/output price per 1M tokens.</li>
        <li>Minimum discount, maximum median latency, minimum reliability and minimum quality, when set.</li>
        <li>Seller capacity: in-flight requests below the offer’s concurrency limit, requests this minute below its RPM limit, and its daily capacity cap not reached.</li>
      </ul>

      <h3>Policy precedence</h3>
      <p>
        The effective policy is resolved in this order: <code>policy_id</code> in the request &gt; the policy attached to the API key’s project &gt; the organization’s default
        policy &gt; the platform default (<code>LOWEST_COST</code>, 2 retries, 30 s timeout, demo offers allowed). Policies are managed in{' '}
        <Link to="/dashboard/routing" className={link}>
          Dashboard → Routing
        </Link>
        , which also has a dry-run simulator.
      </p>
      <DocTable
        caption="How request options merge with the policy"
        head={['Option', 'Merge rule']}
        rows={[
          [<code>routing_mode</code>, 'Replaces the policy mode.'],
          [
            <>
              <code>min_discount_pct</code>, <code>min_reliability</code>, <code>min_quality_score</code>
            </>,
            'The higher (stricter) of policy and request.',
          ],
          [<code>max_latency_ms</code>, 'The lower (stricter) of policy and request.'],
          [<code>allowed_providers</code>, 'Intersection with the policy allowlist when both are set. An empty intersection makes every offer ineligible.'],
          [<code>blocked_providers</code>, 'Union of policy and request.'],
          [<code>preferred_providers</code>, 'Replaces the policy list.'],
          ['Max price per 1M, demo offers, retries, timeout, weights', 'Policy only; cannot be set per request.'],
        ]}
      />
      <p>Requests can change preferences, but they can only tighten limits, never loosen them.</p>

      <h3>Failover and health</h3>
      <ul>
        <li>The router tries up to (policy max retries + 1) offers in rank order. The per-attempt timeout is the lower of the offer’s timeout and the policy timeout.</li>
        <li>Offers that are at their concurrency limit at dispatch time are skipped.</li>
        <li>
          Timeouts, network errors, upstream 5xx, 429, 401/402/403, malformed responses and blocked destinations are retryable: the next offer is tried and the failing offer
          is taken out of routing until a recovery probe succeeds (see <a href="#validation">offer health</a>).
        </li>
        <li>
          Other upstream 4xx errors are caused by the request itself, so failover stops and you receive <code>400 upstream_rejected_request</code>.
        </li>
        <li>
          If every attempt fails you receive <code>502 upstream_unavailable</code>, nothing is billed, and a <code>provider.down</code> event is emitted.
        </li>
      </ul>

      <h3>Request trace</h3>
      <p>
        <code>GET /v1/requests/{'{id}'}</code> returns the request record, the routing trace (mode, explanation, up to 8 ranked offers, up to 30 rejected offers with reasons,
        effective constraints, estimates and policy) and every attempt. Only requests made with the calling key are visible. Rejected requests include a trace without
        estimates.
      </p>
      <Code language="json" code={exampleRequestTrace} title="GET /v1/requests/{id}" />
    </DocSection>
  );
}

export function AgentModeSection({ ctx }: { ctx: DocsCtx }) {
  return (
    <DocSection
      id="agent-mode"
      title="Cost-aware agent mode"
      lead='For agents and batch jobs, set "model": "auto" and describe requirements and a cost ceiling; the router picks a model and offer that satisfy them.'
    >
      <Code samples={agentMode(ctx.apiBaseUrl)} />
      <DocTable
        caption="Agent mode controls"
        minWidth={620}
        head={['Control', 'Behaviour']}
        rows={[
          [
            <>
              <code>model: "auto"</code>
            </>,
            'Candidates are offers for every catalog model that supports chat through the API. The routing mode decides which model wins; nexovra.model tells you which one served.',
          ],
          [
            <code>max_cost_usd</code>,
            <>
              Caps <code>max_tokens</code> per offer so the reserved worst-case cost fits: the prompt (estimated tokens × 1.25) is priced first and the remaining budget buys
              output tokens. Offers that could produce fewer than 16 output tokens are skipped; if none remain the request fails with <code>402 max_cost_too_low</code>. The
              charge never exceeds the reserved hold.
            </>,
          ],
          [<code>required_capabilities</code>, <>Adds <code>tools</code>, <code>vision</code>, <code>json_mode</code> or <code>streaming</code> to the requirements derived from the request.</>],
          [<code>min_quality_score</code>, 'Excludes models whose published benchmark score is lower, and models without any published result.'],
          [<code>allowed_providers</code>, 'Restricts candidates to model providers (e.g. meta) or specific sellers.'],
          [<code>max_latency_ms</code>, 'Excludes offers whose measured median latency is higher, and offers without measurements.'],
        ]}
      />
      <ul>
        <li>
          With <code>LOWEST_COST</code> (the default) <code>auto</code> picks the cheapest eligible offer across all models, which is often the smallest model. Combine it with{' '}
          <code>min_quality_score</code> or <code>QUALITY_FIRST</code> when quality matters.
        </li>
        <li>
          Pass an explicit <code>max_tokens</code>: with <code>auto</code> the default is 4096 and is not clamped to each model’s maximum output.
        </li>
        <li>
          When <code>max_cost_usd</code> lowers <code>max_tokens</code>, the answer can be cut short (<code>finish_reason: "length"</code>).
        </li>
        <li>
          Use <code>task_id</code> with a per-task budget to cap the total spend of a multi-step agent run.
        </li>
      </ul>
      <Alert tone="warning" title="No guarantee of quality or savings">
        Agent mode only applies the constraints you set to measured data: published benchmark scores, measured latency and current prices. It does not guarantee output quality,
        task success or savings beyond what that data shows. Models and offers without measurements are excluded by the corresponding filters rather than assumed to be good.
      </Alert>
    </DocSection>
  );
}

export function UsageBillingSection({ ctx }: { ctx: DocsCtx }) {
  const fee = ctx.feePct ?? 'the configured platform fee';
  return (
    <DocSection id="usage-billing" title="Usage & billing" lead="Usage is prepaid. Funds are reserved before a request is sent and settled once, against actual usage, when it completes.">
      <h3>Holds and settlement</h3>
      <ol>
        <li>
          <strong>Hold.</strong> Before dispatch, the worst-case cost is reserved: estimated prompt tokens × 1.25 plus the attempt’s <code>max_tokens</code>, at the offer’s
          prices, taking the most expensive offer in the failover plan. The hold is atomically moved from your available balance to held funds; if it does not fit, the
          request fails with <code>402 insufficient_balance</code>.
        </li>
        <li>
          <strong>Settle.</strong> On success the actual cost is computed from the seller-reported token usage (or an estimate, flagged <code>usage_estimated</code>), capped
          at the hold. Your balance is debited, the unused hold released, and the seller credited, in one database transaction.
        </li>
        <li>
          <strong>Failures are not billed.</strong> Rejected requests never place a hold. If every attempt fails, the hold is released in full.
        </li>
      </ol>
      <p>
        Each ledger entry is unique per request and type, so a request can never be billed twice. Amounts are tracked in micro-dollars and token costs are rounded up to the
        next micro-dollar.
      </p>

      <h3>Platform fee</h3>
      <p>
        You pay the seller’s listed price per token. The platform fee ({ctx.feeBps !== null ? <strong>{fee}</strong> : fee}
        {ctx.feeBps !== null && <> = {ctx.feeBps} basis points on this server</>}) is deducted from the seller’s share, not added to your bill. See{' '}
        <Link to="/pricing" className={link}>
          Pricing
        </Link>
        .
      </p>

      <h3>Idempotency</h3>
      <p>
        Send an <code>Idempotency-Key</code> header (up to 200 characters, scoped to your organization) to make retries safe. If a request with the same key already exists you
        receive <code>409 idempotency_conflict</code> with <code>details.original_request_id</code> and <code>details.original_status</code>; nothing is executed or billed again.
      </p>
      <ul>
        <li>
          The original response body is not stored and is not replayed. Look up the outcome and cost with <code>GET /v1/requests/{'{original_request_id}'}</code>.
        </li>
        <li>
          A key is recorded for every request that reached routing, including rejected (for example <code>insufficient_balance</code>) and failed ones. Use a new key after
          fixing the cause.
        </li>
        <li>OpenAI SDKs retry some errors automatically with the same headers; disable SDK retries when you use idempotency keys (see SDK examples).</li>
      </ul>

      <h3>Realized cost vs estimated savings</h3>
      <p>
        <code>cost_usd</code> is the amount actually charged. <code>baseline_cost_usd</code> prices the same tokens at the model’s baseline reference price and{' '}
        <code>estimated_savings_usd</code> is the difference. Savings are estimates against a reference list price, not a quote from another provider; they can be negative,
        are <code>null</code> when the model has no baseline, and baseline prices flagged <code>demo: true</code> are illustrative. Billed partial streams carry no baseline.
      </p>

      <h3>Balance, usage and traces</h3>
      <Code samples={accountEndpoints(ctx.apiBaseUrl)} />
      <Code language="json" code={exampleBalance} title="GET /v1/balance" />
      <p>
        <code>balance_usd</code> is the available balance (holds already deducted); <code>held_usd</code> is reserved by in-flight requests.
      </p>
      <Code language="json" code={exampleUsage} title="GET /v1/usage?days=7" />
      <p>
        Usage covers the calling key only, in UTC days (<code>days</code> 1–90, default 30). Failed requests count in <code>failures</code> with zero tokens and cost. The
        organization-wide view, CSV export and per-request traces are in{' '}
        <Link to="/dashboard/usage" className={link}>
          Dashboard → Usage
        </Link>
        .
      </p>

      <h3>Funding</h3>
      {ctx.billingMode === 'stripe' ? (
        <p>
          This server accepts card top-ups through Stripe Checkout ($5–$5,000 per top-up) in{' '}
          <Link to="/dashboard/billing" className={link}>
            Dashboard → Billing
          </Link>
          . Credit is applied only after Stripe’s signature-verified webhook confirms payment; returning from Checkout alone never credits an account.
        </p>
      ) : (
        <Alert tone="demo" title={ctx.billingMode === 'demo' ? 'Demo billing on this server' : 'Billing modes'} className="mb-4">
          In demo billing, new workspaces receive a labelled demo credit at sign-up and can add more in Dashboard → Billing (up to $50 per grant, $100 in total per
          organization). Demo credit is not real money. With Stripe billing, card top-ups ($5–$5,000) are credited only after Stripe’s signature-verified webhook confirms
          payment.
        </Alert>
      )}
    </DocSection>
  );
}

export function BudgetsSection() {
  return (
    <DocSection
      id="budgets"
      title="Smart Budget Guard"
      lead="Budgets are enforced on the server before a request is dispatched, using the request’s worst-case reserved cost."
    >
      <p>
        Configure budgets in{' '}
        <Link to="/dashboard/billing#budget" className={link}>
          Dashboard → Billing → Budget
        </Link>{' '}
        (requires <code>budget:manage</code>: Owner, Admin or Billing). A budget applies to the whole organization or to one project (requests from keys assigned to that
        project). Days and months are UTC.
      </p>
      <DocTable
        caption="Budget settings"
        minWidth={620}
        head={['Setting', 'Limits', 'Enforcement']}
        rows={[
          ['Daily limit', 'up to $1,000,000', <>Settled spend today + in-flight holds + this request’s hold must fit, else <code>daily_budget_exceeded</code>.</>],
          ['Monthly limit', 'up to $10,000,000', <>Same check for the calendar month, else <code>monthly_budget_exceeded</code>.</>],
          [
            'Max per request',
            'up to $10,000',
            <>
              Caps <code>max_tokens</code> per offer like <code>max_cost_usd</code>; with a hard limit, a hold above it fails with <code>request_budget_exceeded</code>.
            </>,
          ],
          [
            'Max per task',
            'up to $100,000',
            <>
              Applies to requests with a <code>task_id</code>; settled + in-flight spend for that task across the organization, else <code>task_budget_exceeded</code>.
            </>,
          ],
          ['Alert thresholds', 'up to 6 values, 1–100%', 'Default 50, 80, 100.'],
          ['Hard limit', 'on by default', 'When off, the budget only sends alerts; the max-per-request value still caps max_tokens.'],
        ]}
      />
      <p>
        Independently of budgets, an API key’s spend limit is checked first (<code>key_spend_limit_exceeded</code>). All budget errors use HTTP 402 and include the limit and
        current spend in <code>details</code>.
      </p>
      <h3>Alerts</h3>
      <p>
        After each successful request, settled spend for the day and month is compared with the thresholds. The highest newly crossed threshold creates an in-app notification
        and a <code>budget.threshold</code> webhook event (severity critical at 100% or more), at most once per threshold per period.
      </p>
      <Alert tone="info" title="In-flight requests">
        Requests already in flight hold their worst-case cost. They can still complete and be charged after a limit is reached, so actual spend can briefly exceed a limit by
        the amount of concurrently running requests.
      </Alert>
    </DocSection>
  );
}
