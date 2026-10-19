import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, KeyRound, Pencil, Plus, RefreshCw, RotateCcw, Send, Trash2, Webhook } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  CodeBlock,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  StatusBadge,
  Switch,
  Table,
  Td,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { useOrgId } from '@/features/dashboard/shared';
import { EVENT_DESCRIPTIONS, type WebhookDelivery, type WebhookEndpoint } from './types';

interface WebhooksResponse {
  data: WebhookEndpoint[];
  availableEvents: string[];
}

const NO_EVENTS: string[] = [];

function useInvalidateWebhooks() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return () => qc.invalidateQueries({ queryKey: ['webhooks', orgId] });
}

export function WebhooksSection() {
  const orgId = useOrgId();
  const canManage = useCan('webhooks:manage');
  const toast = useToast();
  const invalidate = useInvalidateWebhooks();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);
  const [rotating, setRotating] = useState<WebhookEndpoint | null>(null);
  const [secret, setSecret] = useState<{ value: string; url: string; rotated: boolean } | null>(null);
  // Stable close handlers (the modal re-runs focus management when onClose changes identity).
  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const closeRotate = useCallback(() => setRotating(null), []);
  const closeSecret = useCallback(() => setSecret(null), []); // secret is discarded on close

  const query = useQuery({
    queryKey: ['webhooks', orgId],
    queryFn: () => api.get<WebhooksResponse>('/api/webhooks'),
    enabled: Boolean(orgId),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/webhooks/${id}`),
    onSuccess: () => {
      toast.success('Webhook endpoint deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => toast.error('Could not delete endpoint', errorMessage(err)),
  });

  const rotate = useMutation({
    mutationFn: (hook: WebhookEndpoint) => api.post<{ secret: string }>(`/api/webhooks/${hook.id}/rotate-secret`),
    gcTime: 0,
    onSuccess: (res, hook) => {
      // Keep the plaintext secret only in the one-time modal state.
      queueMicrotask(() => rotate.reset());
      setRotating(null);
      setSecret({ value: res.secret, url: hook.url, rotated: true });
    },
    onError: (err) => toast.error('Could not rotate secret', errorMessage(err)),
  });

  const hooks = query.data?.data ?? [];
  const events = query.data?.availableEvents ?? NO_EVENTS;

  return (
    <>
      <Card className="mb-6">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Webhook className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden /> Webhook endpoints
            </span>
          }
          description="Events are POSTed as JSON with a Nexovra-Signature header. Up to 10 endpoints per organization."
          actions={
            canManage ? (
              <Button size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden />} disabled={hooks.length >= 10}>
                Add endpoint
              </Button>
            ) : (
              <Badge>View only</Badge>
            )
          }
        />
        {query.isLoading ? (
          <LoadingBlock rows={3} className="p-5" />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load webhooks" />
        ) : hooks.length === 0 ? (
          <EmptyState
            icon={<Webhook className="h-5 w-5" aria-hidden />}
            title="No webhook endpoints"
            description="Forward budget, key, offer and payout events to Slack bridges, incident tools or your own backend."
            action={
              canManage ? (
                <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden />}>
                  Add your first endpoint
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-brand-50 dark:divide-navy-700">
            {hooks.map((h) => (
              <WebhookItem key={h.id} hook={h} canManage={canManage} onEdit={() => setEditing(h)} onDelete={() => setDeleting(h)} onRotate={() => setRotating(h)} />
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          <CardHeader title="Verify signatures" description="Reject requests whose signature doesn't match or whose timestamp is older than 5 minutes" />
          <CardBody>
            <CodeBlock samples={VERIFY_SAMPLES} />
          </CardBody>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Delivery & retries" />
          <CardBody className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Header format: <code className="break-all font-mono text-xs">Nexovra-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code> where <code className="font-mono text-xs">v1</code> is HMAC-SHA256 of{' '}
              <code className="font-mono text-xs">{'`${t}.${rawBody}`'}</code> keyed with your endpoint secret. Allow 300 s of clock skew.
            </p>
            <p>Respond with any 2xx within 10 seconds. Non-2xx responses, timeouts and network errors are retried after 30 s, 2 min, 10 min, 1 h and 6 h; after the sixth failed attempt the delivery is marked failed and can be retried manually.</p>
            <p>
              Each body includes an <code className="font-mono text-xs">id</code> (also sent as <code className="font-mono text-xs">Nexovra-Delivery-Id</code>) - use it to ignore duplicates.
            </p>
          </CardBody>
        </Card>
      </div>

      <WebhookFormModal
        open={createOpen}
        events={events}
        onClose={closeCreate}
        onCreated={(res) => {
          setCreateOpen(false);
          setSecret({ value: res.secret, url: res.webhook.url, rotated: false });
        }}
      />
      <WebhookFormModal open={Boolean(editing)} events={events} hook={editing ?? undefined} onClose={closeEdit} />

      <Modal
        open={Boolean(deleting)}
        onClose={closeDelete}
        title="Delete webhook endpoint?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete endpoint
            </Button>
          </>
        }
      >
        <p className="break-words text-sm text-slate-700 dark:text-slate-300">
          <span className="font-mono text-xs">{deleting?.url}</span> will stop receiving events and its delivery history will be deleted.
        </p>
      </Modal>

      <Modal
        open={Boolean(rotating)}
        onClose={closeRotate}
        title="Rotate signing secret?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRotating(null)}>
              Cancel
            </Button>
            <Button loading={rotate.isPending} onClick={() => rotating && rotate.mutate(rotating)} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}>
              Rotate secret
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-300">
          The current secret stops working immediately - deliveries are signed with the new secret from now on. Update your receiver right after copying it.
        </p>
      </Modal>

      <Modal
        open={Boolean(secret)}
        onClose={closeSecret}
        title={secret?.rotated ? 'New signing secret' : 'Endpoint created'}
        description={secret?.url}
        size="lg"
        footer={<Button onClick={() => setSecret(null)}>I've saved the secret</Button>}
      >
        {secret && (
          <div className="space-y-4">
            <Alert tone="warning" title="Copy this signing secret now - it will not be shown again">
              It is stored encrypted and is never displayed again. If you lose it, rotate the secret.
            </Alert>
            <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/50 p-3 dark:border-navy-600 dark:bg-navy-900">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-slate-900 dark:text-slate-100">{secret.value}</code>
              <CopyButton value={secret.value} label="Copy secret" />
            </div>
            <CodeBlock code={`export NEXOVRA_WEBHOOK_SECRET=${secret.value}`} language="bash" />
          </div>
        )}
      </Modal>
    </>
  );
}

function WebhookItem({ hook, canManage, onEdit, onDelete, onRotate }: { hook: WebhookEndpoint; canManage: boolean; onEdit: () => void; onDelete: () => void; onRotate: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const orgId = useOrgId();
  const invalidate = useInvalidateWebhooks();
  const [showDeliveries, setShowDeliveries] = useState(false);

  const toggle = useMutation({
    mutationFn: (active: boolean) => api.patch<{ webhook: WebhookEndpoint }>(`/api/webhooks/${hook.id}`, { active }),
    onSuccess: (res) => {
      toast.success(res.webhook.active ? 'Endpoint enabled' : 'Endpoint paused', res.webhook.active ? undefined : 'Pending deliveries to a paused endpoint are marked failed.');
      invalidate();
    },
    onError: (err) => toast.error('Could not update endpoint', errorMessage(err)),
  });

  const test = useMutation({
    mutationFn: () => api.post<{ deliveryId: string }>(`/api/webhooks/${hook.id}/test`),
    onSuccess: () => {
      toast.success('Test event queued', 'A test.ping delivery will be sent within a few seconds.');
      setShowDeliveries(true);
      qc.invalidateQueries({ queryKey: ['webhook-deliveries', orgId, hook.id] });
    },
    onError: (err) => toast.error('Could not send test event', errorMessage(err)),
  });

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-sm text-slate-900 dark:text-white">{hook.url}</span>
            {hook.active ? <StatusBadge status="ACTIVE" /> : <StatusBadge status="PAUSED" />}
          </div>
          {hook.description && <p className="mt-0.5 text-sm text-muted">{hook.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hook.events.map((e) => (
              <Badge key={e} tone="cyan" title={EVENT_DESCRIPTIONS[e]}>
                {e}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Created {formatDate(hook.createdAt)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <span className="mr-2 flex items-center gap-2 text-xs text-muted">
            {hook.active ? 'Active' : 'Paused'}
            <Switch checked={hook.active} onChange={(v) => toggle.mutate(v)} label={`${hook.active ? 'Pause' : 'Enable'} ${hook.url}`} disabled={!canManage || toggle.isPending} />
          </span>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" onClick={() => test.mutate()} loading={test.isPending} disabled={!hook.active} title={hook.active ? 'Send a test.ping event' : 'Enable the endpoint to send a test'} leftIcon={<Send className="h-3.5 w-3.5" aria-hidden />}>
                Test
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Edit ${hook.url}`} onClick={onEdit}>
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Rotate signing secret for ${hook.url}`} title="Rotate signing secret" onClick={onRotate}>
                <KeyRound className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Delete ${hook.url}`} onClick={onDelete}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowDeliveries((s) => !s)}
        aria-expanded={showDeliveries}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
      >
        {showDeliveries ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        {showDeliveries ? 'Hide deliveries' : 'Show recent deliveries'}
      </button>
      {showDeliveries && <DeliveriesLog hookId={hook.id} canManage={canManage} />}
    </li>
  );
}

function DeliveriesLog({ hookId, canManage }: { hookId: string; canManage: boolean }) {
  const orgId = useOrgId();
  const toast = useToast();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['webhook-deliveries', orgId, hookId],
    queryFn: () => api.get<{ data: WebhookDelivery[] }>(`/api/webhooks/${hookId}/deliveries`),
    enabled: Boolean(orgId),
    refetchInterval: (q) => (q.state.data?.data.some((d) => d.status === 'PENDING') ? 5000 : false),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/api/webhooks/deliveries/${id}/retry`),
    onSuccess: () => {
      toast.success('Delivery re-queued', 'It will be attempted again shortly.');
      qc.invalidateQueries({ queryKey: ['webhook-deliveries', orgId, hookId] });
    },
    onError: (err) => toast.error('Could not retry delivery', errorMessage(err)),
  });
  const rows = query.data?.data ?? [];

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-brand-100 dark:border-navy-600">
      <div className="flex items-center justify-between gap-2 border-b border-brand-50 px-4 py-2 dark:border-navy-700">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Last 50 deliveries</p>
        <Button variant="ghost" size="sm" onClick={() => query.refetch()} loading={query.isFetching && !query.isLoading} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
          Refresh
        </Button>
      </div>
      {query.isLoading ? (
        <LoadingBlock rows={2} className="p-4" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load deliveries" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">No deliveries yet. Send a test event to try your endpoint.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Status</Th>
              <Th>Event</Th>
              <Th className="text-right">Attempts</Th>
              <Th className="text-right">Response</Th>
              <Th>Last error</Th>
              <Th>Created</Th>
              <Th>Delivered</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <Td>
                  <StatusBadge status={d.status} />
                  {d.status === 'PENDING' && d.attempts > 0 && <span className="mt-0.5 block text-[11px] text-muted">next {formatRelative(d.nextAttemptAt)}</span>}
                </Td>
                <Td className="font-mono text-xs">{d.event}</Td>
                <Td className="num text-right">{d.attempts}</Td>
                <Td className="num text-right">{d.responseStatus ?? '—'}</Td>
                <Td className="max-w-[260px] truncate text-xs" title={d.lastError ?? undefined}>
                  {d.lastError ?? <span className="text-muted">—</span>}
                </Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(d.createdAt)}</Td>
                <Td className="whitespace-nowrap text-xs">{d.deliveredAt ? formatDateTime(d.deliveredAt) : <span className="text-muted">—</span>}</Td>
                <Td className="text-right">
                  {canManage && d.status === 'FAILED' && (
                    <Button variant="outline" size="sm" onClick={() => retry.mutate(d.id)} loading={retry.isPending && retry.variables === d.id} disabled={retry.isPending}>
                      Retry
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

const webhookSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'URL is required')
    .max(500, 'At most 500 characters')
    .refine((v) => {
      try {
        return new URL(v).protocol === 'https:';
      } catch {
        return false;
      }
    }, { message: 'Enter a valid https:// URL' }),
  description: z.string().trim().max(200, 'At most 200 characters'),
  events: z.array(z.string()).min(1, 'Select at least one event'),
});
type WebhookForm = z.infer<typeof webhookSchema>;

function WebhookFormModal({
  open,
  events,
  hook,
  onClose,
  onCreated,
}: {
  open: boolean;
  events: string[];
  hook?: WebhookEndpoint;
  onClose: () => void;
  onCreated?: (res: { webhook: WebhookEndpoint; secret: string }) => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateWebhooks();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WebhookForm>({ resolver: zodResolver(webhookSchema), defaultValues: { url: '', description: '', events: [] } });

  useEffect(() => {
    if (open) reset({ url: hook?.url ?? '', description: hook?.description ?? '', events: hook?.events ?? ['budget.threshold', 'key.revoked'].filter((e) => events.includes(e)) });
  }, [open, hook, events, reset]);

  const save = useMutation({
    mutationFn: async (v: WebhookForm) => {
      if (hook) {
        await api.patch(`/api/webhooks/${hook.id}`, { url: v.url, events: v.events, description: v.description || null });
        return null;
      }
      return api.post<{ webhook: WebhookEndpoint; secret: string }>('/api/webhooks', { url: v.url, events: v.events, ...(v.description && { description: v.description }) });
    },
    gcTime: 0,
    onSuccess: (res) => {
      invalidate();
      if (res) {
        onCreated?.(res);
        queueMicrotask(() => save.reset());
      } else {
        toast.success('Endpoint updated');
        onClose();
      }
    },
    onError: (err) => toast.error(hook ? 'Could not update endpoint' : 'Could not create endpoint', errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hook ? 'Edit webhook endpoint' : 'Add webhook endpoint'}
      description={hook ? undefined : 'A signing secret is generated and shown once after creation.'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="webhook-form" loading={save.isPending}>
            {hook ? 'Save changes' : 'Create endpoint'}
          </Button>
        </>
      }
    >
      <form id="webhook-form" noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <Field label="Endpoint URL" error={errors.url?.message} hint="Must be a public https:// URL. Private and internal addresses are rejected.">
          {(id, aria) => <Input id={id} {...aria} type="url" placeholder="https://example.com/webhooks/nexovra" autoComplete="off" {...register('url')} />}
        </Field>
        <Field label="Description (optional)" error={errors.description?.message}>
          {(id, aria) => <Input id={id} {...aria} maxLength={200} placeholder="e.g. PagerDuty bridge" {...register('description')} />}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Events</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((e) => (
              <Checkbox key={e} value={e} label={<span className="font-mono text-xs">{e}</span>} description={EVENT_DESCRIPTIONS[e]} {...register('events')} />
            ))}
          </div>
          {errors.events?.message && (
            <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
              {errors.events.message}
            </p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

const VERIFY_SAMPLES = [
  {
    label: 'Node.js',
    language: 'js',
    code: `import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.NEXOVRA_WEBHOOK_SECRET; // whsec_...
const TOLERANCE_SECONDS = 300;

function verifyNexovraSignature(rawBody, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const app = express();
// Use the raw body: re-serialized JSON will not match the signature.
app.post('/webhooks/nexovra', express.raw({ type: 'application/json' }), (req, res) => {
  const raw = req.body.toString('utf8');
  if (!verifyNexovraSignature(raw, req.get('Nexovra-Signature'), SECRET)) {
    return res.status(400).send('invalid signature');
  }
  const event = JSON.parse(raw); // { id, type, created_at, org_id, title, body, data }
  console.log(event.type, event.id);
  res.sendStatus(200);
});`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `import hashlib, hmac, json, os, time
from flask import Flask, request, abort

SECRET = os.environ["NEXOVRA_WEBHOOK_SECRET"]  # whsec_...
TOLERANCE_SECONDS = 300

def verify_nexovra_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header:
        return False
    parts = dict(p.strip().split("=", 1) for p in header.split(",") if "=" in p)
    try:
        t = int(parts["t"])
        v1 = parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs(int(time.time()) - t) > TOLERANCE_SECONDS:
        return False
    signed = f"{t}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)

app = Flask(__name__)

@app.post("/webhooks/nexovra")
def nexovra_webhook():
    raw = request.get_data()  # raw bytes, before any JSON parsing
    if not verify_nexovra_signature(raw, request.headers.get("Nexovra-Signature"), SECRET):
        abort(400)
    event = json.loads(raw)  # {id, type, created_at, org_id, title, body, data}
    print(event["type"], event["id"])
    return "", 200`,
  },
];
