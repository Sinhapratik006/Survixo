import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Route, Store, Webhook } from 'lucide-react';
import { Alert, Badge, ButtonLink, CopyButton } from '@/components/ui';
import { Code, DocTable, EXAMPLE_MODEL, useDocsConfig, useDocsTitle } from './docsKit';
import { agentMode, basicChat, envVarSamples, exampleCompletion, streamingChat } from './samples';

const link = 'font-medium text-brand-700 hover:underline dark:text-brand-300';

function Step({ n, id, title, children }: { n: number; id: string; title: string; children: ReactNode }) {
  return (
    <li id={id} className="relative scroll-mt-24 pb-10 pl-14 last:pb-0">
      <span
        className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-brand-200 bg-brand-600 text-sm font-semibold text-white dark:border-brand-700"
        aria-hidden
      >
        {n}
      </span>
      <span className="absolute bottom-0 left-[17px] top-11 w-px bg-brand-100 dark:bg-navy-600" aria-hidden />
      <h2 id={`${id}-title`} className="!mt-1 text-lg font-semibold">
        <span className="sr-only">Step {n}: </span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </li>
  );
}

export default function QuickstartPage() {
  useDocsTitle('Quickstart · Nexovra docs');
  const ctx = useDocsConfig();
  const base = ctx.apiBaseUrl;

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
          <Link to="/docs" className="hover:text-brand-700 dark:hover:text-white">
            Documentation
          </Link>{' '}
          <span aria-hidden>/</span> <span className="text-slate-700 dark:text-slate-200">Quickstart</span>
        </nav>
        <header className="mb-10">
          <p className="eyebrow">Quickstart</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Make your first request in a few minutes</h1>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
            Create an account and an API key, fund your balance, then call the OpenAI-compatible API with the SDK you already use.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-white px-4 py-3 text-sm dark:border-navy-600 dark:bg-navy-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Base URL</span>
            <code className="break-all rounded bg-brand-50 px-1.5 py-0.5 text-brand-800 dark:bg-navy-700 dark:text-brand-200">{base}</code>
            <CopyButton value={base} label="Copy base URL" />
          </div>
        </header>

        <ol className="prose-docs !list-none !pl-0">
          <Step n={1} id="account" title="Create an account">
            <p>
              <Link to="/signup" className={link}>
                Sign up
              </Link>{' '}
              with your email and a password (at least 10 characters)
              {ctx.googleAuthEnabled ? ' or continue with Google' : ''}. A personal workspace is created for you automatically, with you as its Owner. To collaborate, create a
              team organization later in Dashboard → Teams.
            </p>
            {ctx.googleAuthEnabled === false && (
              <p className="text-sm text-muted">Google sign-in is not configured on this server, so only email sign-up is available.</p>
            )}
          </Step>

          <Step n={2} id="api-key" title="Create an API key">
            <p>
              Open{' '}
              <Link to="/dashboard/api-keys" className={link}>
                Dashboard → API keys
              </Link>{' '}
              and create a key. Optionally give it a spend limit, a requests-per-minute limit or an expiry date. The secret (<code>nxv_…</code>) is shown <strong>only once</strong>
              ; store it in the <code>NEXOVRA_API_KEY</code> environment variable on your server.
            </p>
            <Code samples={envVarSamples} />
            <Alert tone="warning" className="mb-4">
              Never put API keys in frontend or mobile code. The API does not send CORS headers; call it from your backend.
            </Alert>
          </Step>

          <Step n={3} id="fund" title="Fund your balance">
            {ctx.billingMode === 'stripe' ? (
              <>
                <p>
                  Top up with a card in{' '}
                  <Link to="/dashboard/billing" className={link}>
                    Dashboard → Billing
                  </Link>{' '}
                  ($5–$5,000 via Stripe Checkout). Your balance is credited after Stripe confirms the payment.
                </p>
                <Badge tone="neutral">Billing mode: Stripe</Badge>
              </>
            ) : (
              <>
                <p>
                  {ctx.billingMode === 'demo' ? 'This server uses demo billing. ' : ''}New workspaces receive a labelled demo credit at sign-up, and you can add more in{' '}
                  <Link to="/dashboard/billing" className={link}>
                    Dashboard → Billing
                  </Link>{' '}
                  (up to $50 per grant, $100 in total). Demo credit is not real money. When the server is configured for Stripe, this step is a card top-up instead.
                </p>
                {ctx.billingMode === 'demo' && <Badge tone="demo">Billing mode: demo credits</Badge>}
              </>
            )}
            <p className="mt-4">
              Each request reserves its worst-case cost before it is sent and is charged only for actual usage. Failed requests are not billed.
            </p>
          </Step>

          <Step n={4} id="model" title="Pick a model">
            <p>
              Browse the{' '}
              <Link to="/models" className={link}>
                model marketplace
              </Link>{' '}
              or call <code>GET /v1/models</code>, and use the model <code>id</code>. The examples use <code>{EXAMPLE_MODEL}</code>. Prefer to let Nexovra choose? Use{' '}
              <code>"model": "auto"</code> with routing options such as a cost ceiling and a minimum benchmark score:
            </p>
            <Code samples={agentMode(base)} />
            <p className="text-sm text-muted">
              Routing uses measured prices, latency and published benchmark results only. It does not guarantee quality or savings. See{' '}
              <Link to="/docs#agent-mode" className={link}>
                Agent mode
              </Link>
              .
            </p>
          </Step>

          <Step n={5} id="first-request" title="Make your first request">
            <p>Install the official OpenAI SDK (<code>pip install openai</code> or <code>npm install openai</code>) and point it at the Nexovra base URL:</p>
            <Code samples={basicChat(base)} />
            <p>The response is a standard chat completion with an extra <code>nexovra</code> object describing routing and cost:</p>
            <Code language="json" code={exampleCompletion} title="Response" />
            {ctx.demoMode && (
              <Alert tone="demo" className="mb-4">
                On this demo server, demo offers return synthetic text that starts with a demo notice, and <code>nexovra.demo</code> is <code>true</code>.
              </Alert>
            )}
            <h3>Streaming</h3>
            <p>
              Add <code>stream: true</code>. Tokens arrive as Server-Sent Events; the last chunk has empty <code>choices</code> and carries <code>usage</code> and{' '}
              <code>nexovra</code>, followed by <code>[DONE]</code>.
            </p>
            <Code samples={streamingChat(base)} />
          </Step>

          <Step n={6} id="inspect" title="Inspect usage and set a budget">
            <ul>
              <li>
                See spend, latency and every request with its routing trace in{' '}
                <Link to="/dashboard/usage" className={link}>
                  Dashboard → Usage
                </Link>
                .
              </li>
              <li>
                From code, fetch the trace for a request made with your key: <code>GET /v1/requests/{'{nexovra.request_id}'}</code>. It lists the offers considered, why others
                were rejected, and each attempt.
              </li>
              <li>
                Protect yourself from surprises with daily, monthly, per-request and per-task limits in{' '}
                <Link to="/dashboard/billing#budget" className={link}>
                  Dashboard → Billing → Budget
                </Link>
                .
              </li>
            </ul>
            <Code
              language="bash"
              title="Fetch a request trace"
              code={`curl ${base}/requests/req_XXXXXXXXXXXXXXXXXXXXXXXX \\\n  -H "Authorization: Bearer $NEXOVRA_API_KEY"`}
            />
          </Step>
        </ol>

        <section aria-labelledby="troubleshooting-title" className="prose-docs mt-14">
          <h2 id="troubleshooting-title">Troubleshooting</h2>
          <DocTable
            caption="Common errors"
            minWidth={600}
            head={['Error', 'Likely cause', 'Fix']}
            rows={[
              [
                <code>401 invalid_api_key</code>,
                'The key is mistyped, truncated, has surrounding whitespace, or was never created on this server.',
                <>
                  Check <code>NEXOVRA_API_KEY</code> is set in the process making the call and starts with <code>nxv_</code>; create a new key if needed. Revoked or expired keys
                  return <code>api_key_revoked</code> / <code>api_key_expired</code>.
                </>,
              ],
              [
                <code>402 insufficient_balance</code>,
                'The available balance cannot cover the request’s worst-case hold (prompt estimate + max_tokens).',
                <>
                  Add funds in Dashboard → Billing, or lower <code>max_tokens</code>. <code>details.required_hold_usd</code> shows the amount needed.
                </>,
              ],
              [
                <code>404 model_not_found</code>,
                'The model id or alias is not in the catalog.',
                <>
                  Copy an <code>id</code> from <code>GET /v1/models</code> or the Models page, or use <code>auto</code>.
                </>,
              ],
              [
                <code>503 no_eligible_offer</code>,
                'Offers exist, but none meets the request’s constraints (capabilities, context window, latency, reliability, allowlists, capacity, health).',
                <>
                  Read <code>details.rejected</code> for per-offer reasons, relax <code>nexovra</code> options or the routing policy, or retry shortly if offers are recovering.
                </>,
              ],
            ]}
          />
          <p>
            Every error code is listed in the{' '}
            <Link to="/docs#errors" className={link}>
              error reference
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="next-steps-title" className="mt-12">
          <h2 id="next-steps-title" className="text-xl font-semibold text-slate-900 dark:text-white">
            Next steps
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { to: '/docs#routing', icon: <Route className="h-5 w-5" aria-hidden />, title: 'Routing policies', text: 'Modes, eligibility rules, precedence and failover.' },
              { to: '/docs#webhooks', icon: <Webhook className="h-5 w-5" aria-hidden />, title: 'Webhooks', text: 'Signed budget, key and provider events.' },
              { to: '/docs#selling', icon: <Store className="h-5 w-5" aria-hidden />, title: 'Sell capacity', text: 'List your OpenAI-compatible endpoint as offers.' },
            ].map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="card group block p-5 transition-colors hover:border-brand-300 focus-visible:border-brand-400 dark:hover:border-brand-700"
              >
                <span className="text-brand-600 dark:text-brand-300">{c.icon}</span>
                <span className="mt-3 flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
                  {c.title}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
                <span className="mt-1 block text-sm text-muted">{c.text}</span>
              </Link>
            ))}
          </div>
          <div className="mt-6">
            <ButtonLink to="/docs" variant="outline" leftIcon={<BookOpen className="h-4 w-4" aria-hidden />}>
              Read the full documentation
            </ButtonLink>
          </div>
        </section>
      </div>
    </div>
  );
}
