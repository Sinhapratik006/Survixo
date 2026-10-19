import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Play, ShieldCheck, XCircle } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  DemoBadge,
  ErrorState,
  Field,
  Input,
  KeyValue,
  LoadingBlock,
  Modal,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMs, formatNumber, formatPercent, formatRatio, formatTokens, formatUsd } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { useOrgId } from '@/features/dashboard/shared';
import type { RoutingTrace } from '@/types/api';
import type { ReplayResponse, RequestDetail, StoredPayload } from './types';

/**
 * Full routing trace for one inference request: why an offer was chosen, what
 * was rejected, every attempt, billing figures, and a replay action.
 */
export function RequestTraceModal({ requestId, onClose, onOpenRequest }: { requestId: string | null; onClose: () => void; onOpenRequest?: (id: string) => void }) {
  return (
    <Modal open={Boolean(requestId)} onClose={onClose} title="Request trace" description={requestId ? <span className="font-mono text-xs">{requestId}</span> : undefined} size="xl">
      {requestId && <TraceBody key={requestId} requestId={requestId} onOpenRequest={onOpenRequest} />}
    </Modal>
  );
}

export default RequestTraceModal;

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TraceBody({ requestId, onOpenRequest }: { requestId: string; onOpenRequest?: (id: string) => void }) {
  const orgId = useOrgId();
  const query = useQuery({
    queryKey: ['usage-request', orgId, requestId],
    queryFn: () => api.get<RequestDetail>(`/api/usage/requests/${encodeURIComponent(requestId)}`),
    enabled: Boolean(orgId),
  });

  if (query.isLoading) return <LoadingBlock rows={6} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load this request" />;
  if (!query.data) return null;

  const { request: r, trace, attempts, payload, payloadNotice } = query.data;
  const savings = r.baselineCostUsd !== null && r.status === 'SUCCESS' ? r.baselineCostUsd - r.costUsd : null;
  const failed = r.status === 'FAILED' || r.status === 'REJECTED';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        {r.isDemo && <DemoBadge label="Demo offer" title="Served by a demo adapter - responses are simulated, not real provider output" />}
        {r.stream && <Badge tone="cyan">Streamed</Badge>}
        <Badge>{r.source.toLowerCase()}</Badge>
        <span className="text-sm text-muted">{formatDateTime(r.createdAt)}</span>
        <CopyButton value={r.id} label="Copy request ID" className="ml-auto" />
      </div>

      {failed && (r.errorCode || r.errorMessage) && (
        <Alert tone="danger" title={`${r.errorCode ?? 'Error'}${r.httpStatus ? ` · HTTP ${r.httpStatus}` : ''}`} className="mb-4">
          {r.errorMessage ?? 'The request did not complete.'}
        </Alert>
      )}

      <Section title="Overview">
        <KeyValue
          className="lg:grid-cols-3"
          items={[
            ['Requested model', <span className="font-mono text-xs">{r.requestedModel}</span>],
            ['Served model', r.modelId ? <span className="font-mono text-xs">{r.modelId}</span> : '—'],
            ['Seller', r.seller ?? '—'],
            ['Selected offer', r.offerId ? <span className="font-mono text-xs">{r.offerId}</span> : '—'],
            ['Routing mode', r.routingMode ? <Badge tone="brand">{r.routingMode.replace(/_/g, ' ').toLowerCase()}</Badge> : '—'],
            ['API key', r.apiKeyName ?? (r.apiKeyId ? 'Deleted key' : 'Dashboard session')],
            ['Tokens (in / out)', <span className="num">{formatNumber(r.inputTokens)} / {formatNumber(r.outputTokens)}{r.usageEstimated && <Badge tone="warning" className="ml-2" title="Provider did not report usage; tokens were estimated">est.</Badge>}</span>],
            ['Cost', <span className="num">{formatUsd(r.costUsd, { precise: true })}</span>],
            ['Baseline reference', <span className="num">{formatUsd(r.baselineCostUsd, { precise: true })}</span>],
            ['Estimated savings', savings === null ? '—' : <span className={cn('num', savings > 0 && 'text-emerald-600 dark:text-emerald-400')}>{formatUsd(savings, { precise: true })}</span>],
            ['Funds held', <span className="num">{formatUsd(r.holdUsd, { precise: true })}</span>],
            ['Latency / TTFT', <span className="num">{formatMs(r.latencyMs)} / {formatMs(r.ttftMs)}</span>],
            ['Retries', <span className="num">{r.retryCount}</span>],
            ['HTTP status', <span className="num">{r.httpStatus ?? '—'}</span>],
            ['Task ID', r.taskId ? <span className="font-mono text-xs">{r.taskId}</span> : '—'],
          ]}
        />
      </Section>

      {trace ? <TraceDetails trace={trace} selectedOfferId={r.offerId} /> : (
        <Section title="Routing">
          <p className="text-sm text-muted">No routing trace was recorded for this request.</p>
        </Section>
      )}

      <Section title={`Attempts (${attempts.length})`}>
        {attempts.length === 0 ? (
          <p className="text-sm text-muted">No seller was called{r.status === 'REJECTED' ? ' - the request was rejected before dispatch (budget, balance or no eligible offer).' : '.'}</p>
        ) : (
          <ol className="relative space-y-3 border-l border-brand-100 pl-5 dark:border-navy-600">
            {attempts.map((a) => (
              <li key={a.attempt} className="relative">
                <span className={cn('absolute -left-[27px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-navy-800', a.ok ? 'text-emerald-500' : 'text-red-500')}>
                  {a.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-slate-900 dark:text-white">Attempt {a.attempt}</span>
                  <span>{a.seller}</span>
                  <span className="font-mono text-xs text-muted">{a.modelId}</span>
                  <Badge tone={a.ok ? 'success' : 'danger'}>{a.ok ? 'ok' : 'failed'}</Badge>
                  <span className="num text-muted">{formatMs(a.latencyMs)}</span>
                  {a.statusCode !== null && <span className="num text-muted">HTTP {a.statusCode}</span>}
                  <span className="text-xs text-muted">{formatDateTime(a.at)}</span>
                </div>
                {(a.errorCode || a.error) && (
                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                    {a.errorCode && <span className="font-mono">{a.errorCode}: </span>}
                    {a.error}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <ReplaySection requestId={r.id} payload={payload} payloadNotice={payloadNotice} onOpenRequest={onOpenRequest} />
    </div>
  );
}

function fmtConstraint(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

/** Routing decision, ranked candidates, rejections, constraints and estimates (also used by the routing simulator). */
export function TraceDetails({ trace, selectedOfferId, selectedLabel = 'selected' }: { trace: RoutingTrace; selectedOfferId: string | null; selectedLabel?: string }) {
  const constraints = Object.entries(trace.constraints ?? {});
  return (
    <>
      <Section title="Routing decision">
        <Alert tone="info" title={`Mode: ${trace.mode.replace(/_/g, ' ').toLowerCase()}${trace.policy ? ` · policy "${trace.policy.name}"` : ''}`}>
          {trace.explanation}
          {trace.policy && <span className="mt-1 block text-xs">Up to {trace.policy.max_retries} failover retries allowed by policy.</span>}
        </Alert>
      </Section>

      <Section title={`Ranked candidates (${trace.ranked.length})`}>
        {trace.ranked.length === 0 ? (
          <p className="text-sm text-muted">No offer was eligible.</p>
        ) : (
          <div className="card overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Seller</Th>
                  <Th>Model</Th>
                  <Th className="text-right">Est. cost</Th>
                  <Th className="text-right">Baseline est.</Th>
                  <Th className="text-right">Discount</Th>
                  <Th className="text-right">p50</Th>
                  <Th className="text-right">Reliability</Th>
                  <Th className="text-right">Quality</Th>
                </tr>
              </thead>
              <tbody>
                {trace.ranked.map((c, i) => {
                  const selected = c.offer_id === selectedOfferId;
                  return (
                    <tr key={c.offer_id} className={cn(selected && 'bg-cyan-50/70 dark:bg-cyan-950/30')}>
                      <Td className="num">{i + 1}</Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {c.seller}
                          {selected && <Badge tone="cyan">{selectedLabel}</Badge>}
                          {c.demo && <DemoBadge label="Demo" />}
                        </div>
                      </Td>
                      <Td className="font-mono text-xs">{c.model}</Td>
                      <Td className="num text-right">{formatUsd(c.est_cost_usd, { precise: true })}</Td>
                      <Td className="num text-right">{formatUsd(c.baseline_est_usd, { precise: true })}</Td>
                      <Td className={cn('num text-right', (c.discount_pct ?? 0) > 0 && 'text-emerald-600 dark:text-emerald-400')}>{formatPercent(c.discount_pct)}</Td>
                      <Td className="num text-right">{formatMs(c.p50_latency_ms)}</Td>
                      <Td className="num text-right">{c.reliability ?? '—'}</Td>
                      <Td className="num text-right">{formatRatio(c.quality, 0)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Section>

      {trace.rejected.length > 0 && (
        <Section title={`Rejected offers (${trace.rejected.length})`}>
          <ul className="divide-y divide-brand-50 rounded-xl border border-brand-100 dark:divide-navy-700 dark:border-navy-600">
            {trace.rejected.map((o) => (
              <li key={o.offer_id} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-white">{o.seller}</span>
                  <span className="font-mono text-xs text-muted">{o.model}</span>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
                  {o.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(constraints.length > 0 || trace.estimates) && (
        <div className="grid gap-6 md:grid-cols-2">
          {constraints.length > 0 && (
            <Section title="Constraints applied">
              <dl className="grid grid-cols-1 gap-y-1.5 text-sm">
                {constraints.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-brand-50 pb-1.5 dark:border-navy-700">
                    <dt className="font-mono text-xs text-muted">{k}</dt>
                    <dd className="num text-right text-slate-800 dark:text-slate-200">{fmtConstraint(v)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}
          {trace.estimates && (
            <Section title="Estimates before dispatch">
              <KeyValue
                items={[
                  ['Estimated input tokens', <span className="num">{formatTokens(trace.estimates.input_tokens)}</span>],
                  ['Max output tokens', <span className="num">{formatTokens(trace.estimates.max_output_tokens)}</span>],
                  ['Worst-case hold', <span className="num">{formatUsd(trace.estimates.hold_usd, { precise: true })}</span>],
                ]}
              />
            </Section>
          )}
        </div>
      )}
    </>
  );
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content === null || content === undefined) return '';
  return JSON.stringify(content, null, 2);
}

function ReplaySection({ requestId, payload, payloadNotice, onOpenRequest }: { requestId: string; payload: StoredPayload | null; payloadNotice: string; onOpenRequest?: (id: string) => void }) {
  const canReplay = useCan('inference:use');
  const toast = useToast();
  const qc = useQueryClient();
  const stored = payload?.messages?.length ? payload.messages : null;
  const [message, setMessage] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [inputError, setInputError] = useState<string | undefined>();

  const replay = useMutation({
    mutationFn: (body: { messages?: Array<{ role: 'user'; content: string }>; maxTokens?: number }) => api.post<ReplayResponse>(`/api/usage/requests/${encodeURIComponent(requestId)}/replay`, body),
    onSuccess: (res) => {
      toast.success('Replay completed', `New request ${res.result.nexovra.request_id}`);
      qc.invalidateQueries({ queryKey: ['usage-requests'] });
      qc.invalidateQueries({ queryKey: ['usage-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err) => toast.error('Replay failed', errorMessage(err)),
  });

  const submit = () => {
    const mt = maxTokens.trim() === '' ? undefined : Number(maxTokens);
    if (mt !== undefined && (!Number.isInteger(mt) || mt < 1 || mt > 8192)) {
      setInputError('Max tokens must be a whole number between 1 and 8192');
      return;
    }
    if (!stored && !message.trim()) {
      setInputError('Enter a message to replay');
      return;
    }
    setInputError(undefined);
    replay.mutate({ ...(stored ? {} : { messages: [{ role: 'user', content: message }] }), ...(mt !== undefined && { maxTokens: mt }) });
  };

  const result = replay.data?.result;
  const content = result?.choices[0]?.message.content ?? '';

  return (
    <Section title="Replay" aside={<span className="inline-flex items-center gap-1 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Re-runs through routing and is billed as a new request</span>}>
      <div className="rounded-xl border border-brand-100 p-4 dark:border-navy-600">
        <p className="text-sm text-muted">{payloadNotice}</p>
        {stored ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted">Stored prompt (secrets redacted, read-only):</p>
            {stored.map((m, i) => (
              <div key={i} className="rounded-lg bg-brand-50/60 px-3 py-2 dark:bg-navy-900/60">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.role}</p>
                <pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-slate-800 dark:text-slate-200">{contentText(m.content)}</pre>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Nexovra does not keep prompt content unless your organization enables redacted retention (Settings → data retention). To replay, provide a new user message - it is sent to the same requested model with the same routing mode.
          </p>
        )}

        {canReplay ? (
          <div className="mt-4 space-y-3">
            {!stored && (
              <Field label="User message" error={inputError && !message.trim() ? inputError : undefined}>
                {(id, aria) => <Textarea id={id} {...aria} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200_000} placeholder="Write the prompt to send..." />}
              </Field>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Max output tokens (optional)" className="w-48" error={inputError && (stored || message.trim()) ? inputError : undefined}>
                {(id, aria) => <Input id={id} {...aria} inputMode="numeric" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="512" />}
              </Field>
              <Button onClick={submit} loading={replay.isPending} leftIcon={<Play className="h-4 w-4" aria-hidden />}>
                Replay request
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">Your role cannot run inference (requires the inference:use permission), so replay is unavailable.</p>
        )}

        {result && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              <span className="font-medium text-slate-900 dark:text-white">Replay result</span>
              {result.nexovra.demo && <DemoBadge label="Demo offer" />}
              <span className="num text-muted">{formatUsd(result.nexovra.cost_usd, { precise: true })}</span>
              <span className="text-muted">via {result.nexovra.seller}</span>
              <span className="num text-muted">{formatMs(result.nexovra.latency_ms)}</span>
            </div>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-slate-800 dark:text-slate-200">{content || '(empty response)'}</pre>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              Request <span className="font-mono">{result.nexovra.request_id}</span>
              <CopyButton value={result.nexovra.request_id} label="Copy ID" iconOnly />
              {onOpenRequest && (
                <Button variant="ghost" size="sm" onClick={() => onOpenRequest(result.nexovra.request_id)}>
                  Open trace
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
