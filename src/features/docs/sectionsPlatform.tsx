import { Check, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui';
import { Code, DocSection, DocTable } from './docsKit';
import type { DocsCtx } from './sectionsBasics';

const link = 'font-medium text-brand-700 hover:underline dark:text-brand-300';

export function SecuritySection() {
  return (
    <DocSection id="security" title="Security & data handling" lead="How credentials, sessions, outbound calls and stored data are protected, and where the limits of those protections are.">
      <h3>API keys</h3>
      <ul>
        <li>Generated from the OS CSPRNG (40 base62 characters, about 238 bits of entropy).</li>
        <li>Stored only as an HMAC-SHA256 with a server-side pepper; a database leak alone does not reveal or verify keys. The secret is returned once at creation or rotation.</li>
      </ul>
      <h3>Dashboard sessions and CSRF</h3>
      <ul>
        <li>
          The web app uses an httpOnly, SameSite=Lax session cookie (Secure over HTTPS). Only a SHA-256 hash of the session token is stored; a new session is issued on every
          sign-in; sessions last 14 days by default.
        </li>
        <li>
          State-changing dashboard requests must come from an allowed Origin and echo the CSRF cookie in the <code>X-CSRF-Token</code> header (double submit, bound to the
          session).
        </li>
        <li>Passwords (minimum 10 characters) are hashed with scrypt. Sign-in timing is equalized for unknown accounts.</li>
        <li>
          Google sign-in uses the authorization code flow with PKCE (S256), a signed short-lived state cookie, and a nonce checked against the verified ID token. Only verified
          Google emails are accepted. If an unverified password account exists with the same email, its password and sessions are revoked before Google is linked.
        </li>
      </ul>
      <h3>Outbound requests (SSRF protection)</h3>
      <p>Seller endpoint URLs and webhook URLs are validated before saving and again at connection time:</p>
      <ul>
        <li>
          HTTPS only (plain HTTP only when an operator enables <code>ALLOW_INSECURE_ENDPOINTS</code>, which is refused in production). No credentials or fragments in URLs.
        </li>
        <li>
          Hostnames such as <code>localhost</code>, <code>*.localhost</code>, <code>*.local</code>, <code>*.internal</code> and cloud metadata names are refused.
        </li>
        <li>
          Every resolved address must be public unicast: private, loopback, link-local, carrier-grade NAT, benchmarking and reserved ranges, IPv4-mapped IPv6, and NAT64/6to4/Teredo
          prefixes are blocked.
        </li>
        <li>Addresses are re-checked when the connection is made (defeating DNS rebinding) and redirects are never followed.</li>
        <li>
          Operators can allow specific private hostnames with <code>PRIVATE_ENDPOINT_ALLOWLIST</code>.
        </li>
      </ul>
      <h3>Secrets at rest</h3>
      <p>
        Seller credentials and webhook signing secrets use envelope encryption: each secret is encrypted with its own random AES-256-GCM data key, which is wrapped with a
        master key. The record id is bound as authenticated data, so a ciphertext cannot be moved to another record. Only a hint (last 4 characters) is ever displayed.
      </p>
      <h3>Redaction and retention</h3>
      <ul>
        <li>Error messages from sellers are sanitized before they reach you: secrets, URLs and IP addresses are removed.</li>
        <li>
          Prompts are <strong>not stored by default</strong>. An organization can opt in to keeping redacted prompts for 7 or 30 days (for replay); redaction of keys, tokens and
          private keys is best-effort. Turning retention off purges stored prompts immediately. Completions are never stored.
        </li>
        <li>Request metadata (model, tokens, cost, trace) is kept for 90 days by default (configurable 7–365 days per organization).</li>
        <li>Webhook delivery logs and health checks are kept 30 days, notifications 90 days; expired sessions are deleted.</li>
      </ul>
      <Alert tone="warning" title="Seller data policies may differ" className="mb-4">
        Your request, including the prompt, is sent to the seller’s endpoint that serves it. Sellers operate their own infrastructure and upstream providers, whose logging and
        retention practices are not controlled by Nexovra. Use <code>allowed_providers</code> or a policy allowlist to restrict which sellers can receive your traffic.
      </Alert>
      <Alert tone="info" title="No model-identity attestation">
        Nexovra verifies that a seller’s endpoint lists the mapped model name and answers test requests. It cannot cryptographically prove which model weights produced a given
        response. Published benchmarks can reveal gross mismatches but are not proof.
      </Alert>
    </DocSection>
  );
}

export function SellingSection({ ctx }: { ctx: DocsCtx }) {
  return (
    <DocSection id="selling" title="Seller guide" lead="List inference capacity you operate behind an OpenAI-compatible endpoint. Buyers are routed to your offers when they are eligible and rank well.">
      <p>
        Seller management requires the <code>seller:manage</code> permission (Owner or Admin) and lives in{' '}
        <Link to="/dashboard/sellers/offers" className={link}>
          Dashboard → Endpoints & offers
        </Link>
        .
      </p>
      <ol>
        <li>
          <strong>Register an endpoint.</strong> Choose the <code>openai_compatible</code> adapter and provide an HTTPS base URL (for example{' '}
          <code>https://inference.example.com/v1</code>) and an API key. The URL must pass the SSRF rules in <a href="#security">Security</a>; the key is stored with envelope
          encryption. Up to 20 endpoints per organization. The <code>demo</code> adapter is only available when the server runs in demo mode.
        </li>
        <li>
          <strong>Verification.</strong> Right after registration, Nexovra calls <code>GET {'{baseUrl}'}/models</code> with your key (15 s timeout). The response must be an
          OpenAI-style <code>{'{"data": [{"id": ...}]}'}</code> list with at least one model; the ids are stored as discovered models. Re-run verification at any time.
        </li>
        <li>
          <strong>Create an offer.</strong> Map a catalog model to an upstream model name that your endpoint listed (otherwise <code>unverifiable_mapping</code>). Set input and
          output prices in USD per 1M tokens, max concurrency (default 8), requests per minute (default 120), timeout (default 30 s, 1–300 s) and an optional daily capacity cap
          in USD. New offers start as drafts.
        </li>
        <li>
          <strong>Validate.</strong> Validation runs live checks (see <a href="#validation">Offer validation</a>). Offers can only be activated after validation passes.
        </li>
        <li>
          <strong>Activate.</strong> Active, validated, healthy offers on a verified endpoint enter routing immediately. Pause or archive at any time.
        </li>
      </ol>
      <h3>Changes after activation</h3>
      <ul>
        <li>Changing the endpoint URL or key puts the endpoint back into verification and pauses all its offers until they are validated again.</li>
        <li>Changing an offer’s upstream model clears its validation; an active offer is paused.</li>
        <li>Price changes apply to new requests immediately and are recorded in the price history.</li>
        <li>Disabling an endpoint archives its offers and deletes the stored credential.</li>
      </ul>
      <h3>Earnings and payouts</h3>
      <p>
        Buyers pay your listed price for the tokens they use. At settlement the platform fee
        {ctx.feePct ? <> (currently {ctx.feePct})</> : null} is deducted and the rest is credited to your seller balance, once per request. Your daily capacity cap is compared
        with the gross amount sold today.
      </p>
      <Alert tone="warning" title="Payouts are recorded, not transferred">
        No payout provider is integrated. Payout requests (minimum $1) reserve the amount from your seller balance and are recorded, but no money moves until an operator
        processes the payout and records the external transfer reference. Status changes emit <code>payout.updated</code>.
      </Alert>
    </DocSection>
  );
}

const LADDER = [1, 2, 5, 10, 30, 60];

export function ValidationSection({ ctx }: { ctx: DocsCtx }) {
  const { minSamples, windowDays } = ctx.reliability;
  return (
    <DocSection id="validation" title="Offer validation & health" lead="Offers must prove they work before receiving traffic and are removed from routing automatically when they stop working.">
      <h3>Validation steps</h3>
      <DocTable
        caption="Validation steps"
        minWidth={600}
        head={['Step', 'Check', 'On failure']}
        rows={[
          ['Endpoint verified', <>Endpoint status is <code>VERIFIED</code>.</>, 'Validation fails.'],
          ['Model mapping', 'The upstream model name is in the endpoint’s discovered model list.', 'Validation fails.'],
          ['Catalog model supports chat', 'The catalog model is available through the chat API.', 'Validation fails.'],
          ['Test completion', '“Reply with the single word OK.” with max_tokens 8 and temperature 0, timeout min(offer timeout, 30 s).', 'Validation fails.'],
          ['Streaming test', 'The same prompt streamed; at least one content chunk is required.', 'Validation still passes, but the offer will not receive streaming requests.'],
        ]}
      />
      <p>A successful validation marks the offer healthy and records which capabilities were verified (chat, streaming).</p>
      <h3>Health and recovery</h3>
      <ul>
        <li>
          A retryable failure on a live request (timeout, network, 5xx, 429, 401/402/403, malformed response) marks the offer unhealthy and removes it from routing. Request
          errors caused by the buyer (other 4xx) do not.
        </li>
        <li>
          A health worker runs every minute and sends a recovery probe (“Reply with OK.”, max_tokens 16, timeout up to 20 s) to unhealthy active offers whose backoff has
          expired. A successful probe returns the offer to routing; only a successfully served live request resets the failure count.
        </li>
        <li>
          Backoff after rate limiting (429) is 30 seconds. Otherwise it follows the number of consecutive failures: {LADDER.map((m) => `${m} min`).join(', ')} (capped at 60
          minutes).
        </li>
        <li>
          Sellers receive an <code>offer.failed</code> event when an offer is taken out of routing. Demo offers are also probed about every 10 minutes.
        </li>
      </ul>
      <h3>Reliability score</h3>
      <p>
        Over the last {windowDays} days, live request attempts and health checks (validation and probes) are combined. With fewer than {minSamples} observations the score is
        shown as insufficient data and offers are excluded by any <code>min_reliability</code> filter. Otherwise:
      </p>
      <Code
        language="text"
        title="Reliability (0-100)"
        code={`score = round(100 × (0.8 × successLowerBound + 0.2 × latencyComponent))

successLowerBound = Wilson score lower bound (95%) of successes / observations
latencyComponent  = 1.0 at p95 ≤ 1 s, falling linearly to 0 at p95 = 10 s
                    (0.5 when no latency data exists)`}
      />
      <p>Median and p95 latency come from successful live attempts in the same window.</p>
    </DocSection>
  );
}

export function BenchmarksSection() {
  return (
    <DocSection id="benchmarks" title="Benchmarks" lead="Quality signals in routing come only from benchmark runs Nexovra has measured and published. Here is exactly what is measured.">
      <DocTable
        caption="nexovra-arith-smoke benchmark"
        minWidth={600}
        head={['', 'nexovra-arith-smoke v1.0.0']}
        rows={[
          ['Dataset', '20 two-operand integer arithmetic questions (addition, subtraction, multiplication), generated deterministically from seed 42, operands 2–99.'],
          ['Method', 'Each question is sent once as a single user message through the normal marketplace pipeline with temperature 0 and max_tokens 32.'],
          ['Grading', 'Correct when the last integer in the response equals the exact answer. Score = correct / completed.'],
          ['Validity', 'A run is recorded only if at least 80% of questions (16 of 20) completed.'],
          ['Recorded', 'Score, sample size, cost, average latency, the offer that served most questions, and whether demo offers were involved.'],
        ]}
      />
      <Alert tone="warning" title="Limitations" className="mb-6">
        This benchmark measures basic arithmetic and instruction following only. It does not represent general model quality, reasoning, coding or factual accuracy, and the
        sample is small (n = 20). Results from demo endpoints are synthetic and reflect their configured accuracy, not a real model.
      </Alert>
      <ul>
        <li>
          <strong>Quality score</strong> (used by <code>QUALITY_FIRST</code>, <code>CUSTOM</code> and <code>min_quality_score</code>): the mean of the latest published accuracy
          result per benchmark for the model, from 0 to 1. Models without published results have no score.
        </li>
        <li>The score is per model, not per offer: all sellers of a model share it, even though only one offer served most of the run.</li>
        <li>
          Public results are run by platform administrators and published. Private runs from the dashboard playground (up to 4 models per run) are visible only to your
          organization, are billed to it, and do not affect routing.
        </li>
      </ul>
    </DocSection>
  );
}

const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'] as const;
type Role = (typeof ROLES)[number];

const PERMISSIONS: Array<[permission: string, description: string, roles: Role[]]> = [
  ['org:manage', 'Rename the organization, set retention', ['OWNER', 'ADMIN']],
  ['org:delete', 'Delete the organization', ['OWNER']],
  ['members:manage', 'Add, remove and change members', ['OWNER', 'ADMIN']],
  ['billing:manage', 'Top up and add demo credit', ['OWNER', 'ADMIN', 'BILLING']],
  ['billing:view', 'View balance and transactions', ['OWNER', 'ADMIN', 'BILLING', 'VIEWER']],
  ['budget:manage', 'Create and change budgets', ['OWNER', 'ADMIN', 'BILLING']],
  ['keys:manage', 'Create, rotate and revoke API keys', ['OWNER', 'ADMIN', 'DEVELOPER']],
  ['keys:view', 'List API keys (masked)', ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']],
  ['usage:view', 'Usage, request traces, alerts', ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER']],
  ['inference:use', 'Playground, arena, replay, private benchmarks', ['OWNER', 'ADMIN', 'DEVELOPER']],
  ['routing:manage', 'Create and edit routing policies', ['OWNER', 'ADMIN', 'DEVELOPER']],
  ['routing:view', 'View routing policies', ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER']],
  ['seller:manage', 'Endpoints, offers and payouts', ['OWNER', 'ADMIN']],
  ['seller:view', 'View seller data', ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER']],
  ['webhooks:manage', 'Create, rotate, test and retry webhooks', ['OWNER', 'ADMIN', 'DEVELOPER']],
  ['audit:view', 'View the audit log', ['OWNER', 'ADMIN']],
  ['projects:manage', 'Create and edit projects', ['OWNER', 'ADMIN', 'DEVELOPER']],
];

const roleLabel = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();

export function TeamsSection() {
  return (
    <DocSection id="teams" title="Teams & roles" lead="Organizations share a balance, API keys, policies and budgets. Every member has exactly one role; permissions are checked on the server.">
      <ul>
        <li>Each user has a personal workspace, which cannot have other members. Create a team organization to collaborate (you can own up to 10).</li>
        <li>Members must already have a Nexovra account. Only Owners can grant or remove the Owner role, and an organization always keeps at least one Owner.</li>
        <li>
          Manage members in{' '}
          <Link to="/dashboard/teams" className={link}>
            Dashboard → Teams
          </Link>
          . Members can leave an organization themselves. Removing a member does not revoke API keys they created, so rotate shared keys when someone leaves.
        </li>
      </ul>
      <div className="mb-6 overflow-x-auto rounded-xl border border-brand-100 bg-white dark:border-navy-600 dark:bg-navy-800">
        <table className="!mb-0 w-full min-w-[680px] text-left text-sm">
          <caption className="sr-only">Role permission matrix</caption>
          <thead className="bg-brand-50/60 dark:bg-navy-700/50">
            <tr>
              <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Permission
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {roleLabel(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map(([perm, desc, roles]) => (
              <tr key={perm}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <code>{perm}</code>
                  <span className="mt-0.5 block text-xs text-muted">{desc}</span>
                </th>
                {ROLES.map((r) => (
                  <td key={r} className="px-3 py-2 text-center">
                    {roles.includes(r) ? (
                      <Check className="mx-auto h-4 w-4 text-brand-600 dark:text-brand-300" aria-label={`${roleLabel(r)}: allowed`} />
                    ) : (
                      <Minus className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600" aria-label={`${roleLabel(r)}: not allowed`} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DocSection>
  );
}
