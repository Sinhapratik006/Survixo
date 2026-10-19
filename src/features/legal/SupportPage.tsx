import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, Mail, TriangleAlert } from 'lucide-react';
import { Alert, Card, CodeBlock, PageHeader } from '@/components/ui';
import { useApiBaseUrl } from '@/features/home/snippets';

const SUPPORT_EMAIL = 'support@nexovra.example';

function ResourceCard({ to, icon, title, text }: { to: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="card group flex flex-col p-5 transition-colors hover:border-brand-300 dark:hover:border-brand-700">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-navy-700 dark:text-brand-300" aria-hidden>
        {icon}
      </span>
      <span className="mt-3 text-sm font-semibold text-slate-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">{title}</span>
      <span className="mt-1 flex-1 text-sm text-muted">{text}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-300">
        Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}

const requestIdExample = (baseUrl: string) => `# Non-streaming responses include the ID in a header and in the body
curl -i ${baseUrl}/chat/completions ...
x-nexovra-request-id: req_...

{ "nexovra": { "request_id": "req_...", ... } }

# Errors include it in error.details
{ "error": { "code": "...", "message": "...", "details": { "request_id": "req_..." } } }`;

export default function SupportPage() {
  const baseUrl = useApiBaseUrl();

  useEffect(() => {
    document.title = 'Support · Nexovra';
  }, []);

  return (
    <div className="container-page max-w-5xl py-10">
      <PageHeader title="Support" description="Most questions are answered in the documentation. If something is broken, check the status page first, then contact us with your request ID." />

      <div className="grid gap-4 md:grid-cols-3">
        <ResourceCard to="/docs" icon={<BookOpen className="h-5 w-5" />} title="Documentation" text="Quickstart, API reference, routing policies and seller guides." />
        <ResourceCard to="/status" icon={<Activity className="h-5 w-5" />} title="System status" text="Live component health, 30-day request success and incident history." />
        <ResourceCard to="/docs#errors" icon={<TriangleAlert className="h-5 w-5" />} title="Error codes" text="What each error code means and how to resolve it before opening a ticket." />
      </div>

      <section aria-labelledby="request-id-heading" className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 id="request-id-heading" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Include your request ID
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Every API request gets a unique ID. It lets us find the routing decision, the offer that served the request and each retry attempt without needing your prompt.
          </p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              Copy the <code className="rounded bg-brand-50 px-1 text-brand-800 dark:bg-navy-700 dark:text-brand-200">x-nexovra-request-id</code> response header, or{' '}
              <code className="rounded bg-brand-50 px-1 text-brand-800 dark:bg-navy-700 dark:text-brand-200">nexovra.request_id</code> from the response body.
            </li>
            <li>
              For errors, use <code className="rounded bg-brand-50 px-1 text-brand-800 dark:bg-navy-700 dark:text-brand-200">request_id</code> from the error details when present.
            </li>
            <li>
              You can also find it in the{' '}
              <Link to="/dashboard/usage" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                usage log
              </Link>
              .
            </li>
            <li>Add the approximate time (with time zone), the model, and the error code or message.</li>
            <li>Never send API keys, passwords or confidential prompt content.</li>
          </ul>
        </div>
        <CodeBlock code={requestIdExample(baseUrl)} language="text" title="Where to find the request ID" />
      </section>

      <section aria-labelledby="contact-heading" className="mt-10">
        <Card className="flex flex-wrap items-start gap-4 p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-navy-700 dark:text-brand-300" aria-hidden>
            <Mail className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="contact-heading" className="text-lg font-semibold text-slate-900 dark:text-white">
              Contact support
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                {SUPPORT_EMAIL}
              </a>{' '}
              <span className="text-muted">(placeholder — set before launch)</span>. The same address accepts community project submissions and security reports.
            </p>
          </div>
        </Card>
        <Alert tone="warning" className="mt-4">
          This contact address is a placeholder and is not monitored. The operator must replace it with a real support channel before launch.
        </Alert>
      </section>
    </div>
  );
}
