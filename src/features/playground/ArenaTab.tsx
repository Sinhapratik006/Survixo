import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Swords, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DemoBadge,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  QueryState,
  Table,
  Td,
  Textarea,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMs, formatNumber, formatUsd } from '@/lib/format';
import { useActiveOrg, useCan } from '@/features/auth/useSession';
import { ResponseMeta } from './ChatTab';
import { InferenceErrorNotice, ModelSlots, StarRating, errorInfo, useApiModels } from './shared';
import type { ArenaHistorySession, ArenaRunResponse } from './types';

const DEFAULT_CRITERIA = ['Accuracy', 'Helpfulness', 'Format'];

interface RatingDraft {
  rating?: number;
  scores: Record<string, number>;
  notes: string;
}

export function ArenaTab({ initialModels }: { initialModels: string[] }) {
  const org = useActiveOrg();
  const canInfer = useCan('inference:use');
  const canViewUsage = useCan('usage:view');
  const toast = useToast();
  const qc = useQueryClient();
  const models = useApiModels();

  const [slots, setSlots] = useState<string[]>(() => {
    const uniq = [...new Set(initialModels.filter(Boolean))].slice(0, 4);
    while (uniq.length < 2) uniq.push('');
    return uniq;
  });
  const [prompt, setPrompt] = useState('');
  const [system, setSystem] = useState('');
  const [maxTokens, setMaxTokens] = useState('512');
  const [criteria, setCriteria] = useState<string[]>(DEFAULT_CRITERIA);
  const [newCriterion, setNewCriterion] = useState('');
  const [consent, setConsent] = useState(false);
  const [ratings, setRatings] = useState<Record<string, RatingDraft>>({});
  const [submitted, setSubmitted] = useState(false);

  const historyKey = ['playground', org?.id, 'arena-history'];
  const history = useQuery({
    queryKey: historyKey,
    queryFn: () => api.get<{ data: ArenaHistorySession[] }>('/api/playground/arena/history'),
    enabled: Boolean(org) && canViewUsage,
  });

  const run = useMutation({
    mutationFn: () =>
      api.post<ArenaRunResponse>('/api/playground/arena/run', {
        prompt: prompt.trim(),
        ...(system.trim() ? { system: system.trim() } : {}),
        modelIds: slots,
        maxTokens: Number(maxTokens),
        criteria,
        consent: true,
      }),
    onSuccess: (res) => {
      setRatings({});
      setSubmitted(false);
      const failed = res.results.filter((r) => !r.ok).length;
      if (failed) toast.info('Arena run finished', `${failed} of ${res.results.length} models returned an error.`);
      else toast.success('Arena run finished');
      void qc.invalidateQueries({ queryKey: historyKey });
    },
    onError: (err) => toast.error('Arena run failed', errorMessage(err)),
  });

  const rate = useMutation({
    mutationFn: (payload: { sessionId: string; ratings: Array<{ requestId: string; rating: number; scores?: Record<string, number>; notes?: string }> }) =>
      api.post(`/api/playground/arena/${encodeURIComponent(payload.sessionId)}/ratings`, { ratings: payload.ratings }),
    onSuccess: () => {
      setSubmitted(true);
      toast.success('Ratings saved');
      void qc.invalidateQueries({ queryKey: historyKey });
    },
    onError: (err) => toast.error('Could not save ratings', errorMessage(err)),
  });

  const maxTokensN = Number(maxTokens);
  const maxTokensError = !Number.isInteger(maxTokensN) || maxTokensN < 16 || maxTokensN > 4096 ? 'Whole number between 16 and 4,096' : undefined;
  const chosen = slots.filter(Boolean);
  const canRun = canInfer && consent && prompt.trim().length > 0 && chosen.length === slots.length && slots.length >= 2 && new Set(slots).size === slots.length && !maxTokensError && !run.isPending;

  const addCriterion = () => {
    const c = newCriterion.trim().slice(0, 40);
    if (!c || criteria.length >= 6 || criteria.some((x) => x.toLowerCase() === c.toLowerCase())) return;
    setCriteria([...criteria, c]);
    setNewCriterion('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canRun) run.mutate();
  };

  const result = run.data;
  const ratedEntries = result
    ? result.results
        .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
        .map((r) => ({ r, draft: ratings[r.requestId] }))
        .filter((x): x is { r: typeof x.r; draft: RatingDraft & { rating: number } } => x.draft?.rating !== undefined)
    : [];

  const submitRatings = () => {
    if (!result || !ratedEntries.length) return;
    rate.mutate({
      sessionId: result.sessionId,
      ratings: ratedEntries.map(({ r, draft }) => ({
        requestId: r.requestId,
        rating: draft.rating,
        ...(Object.keys(draft.scores).length ? { scores: draft.scores } : {}),
        ...(draft.notes.trim() ? { notes: draft.notes.trim().slice(0, 1000) } : {}),
      })),
    });
  };

  const setDraft = (requestId: string, patch: Partial<RatingDraft>) =>
    setRatings((s) => ({ ...s, [requestId]: { scores: {}, notes: '', ...s[requestId], ...patch } }));

  if (models.isLoading) return <LoadingBlock rows={5} />;
  if (models.error) return <ErrorState error={models.error} onRetry={() => models.refetch()} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Side-by-side comparison" description="Send one prompt to 2–4 models at once. Each response is routed, billed and traced individually." />
        <CardBody>
          <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Models (2–4)</p>
                <ModelSlots models={models.data ?? []} value={slots} onChange={setSlots} min={2} max={4} disabled={run.isPending} />
              </div>
              <Field label="Max tokens per response" error={maxTokensError}>
                {(id, aria) => <Input id={id} {...aria} type="number" min={16} max={4096} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="num max-w-[160px]" />}
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Evaluation criteria</legend>
                <div className="flex flex-wrap gap-2">
                  {criteria.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800 ring-1 ring-inset ring-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-200 dark:ring-cyan-800">
                      {c}
                      <button type="button" onClick={() => setCriteria(criteria.filter((x) => x !== c))} className="rounded hover:text-cyan-950 dark:hover:text-white" aria-label={`Remove criterion ${c}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {!criteria.length && <span className="text-xs text-muted">No criteria: only an overall rating will be collected.</span>}
                </div>
                {criteria.length < 6 && (
                  <div className="mt-2 flex gap-2">
                    <label htmlFor="new-criterion" className="sr-only">
                      New criterion
                    </label>
                    <Input
                      id="new-criterion"
                      value={newCriterion}
                      maxLength={40}
                      onChange={(e) => setNewCriterion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCriterion();
                        }
                      }}
                      placeholder="Add criterion, e.g. Conciseness"
                      className="h-9"
                    />
                    <Button variant="outline" size="sm" className="h-9" onClick={addCriterion} disabled={!newCriterion.trim()} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                      Add
                    </Button>
                  </div>
                )}
              </fieldset>
            </div>
            <div className="space-y-4">
              <Field label="System prompt (optional)">
                {(id, aria) => <Textarea id={id} {...aria} value={system} onChange={(e) => setSystem(e.target.value)} rows={2} maxLength={4000} />}
              </Field>
              <Field label="Prompt">
                {(id, aria) => <Textarea id={id} {...aria} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} maxLength={20_000} placeholder="Explain the difference between a mutex and a semaphore with a short example." required />}
              </Field>
              <Checkbox
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                label="I understand this prompt will be sent to multiple providers whose data-handling policies may differ"
                description="Each selected model may be served by a different seller. Only a hash and the length of the prompt are stored with the arena session."
              />
              {!canInfer && <Alert tone="warning">Your role cannot run inference (requires inference:use).</Alert>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!canRun} loading={run.isPending} leftIcon={<Swords className="h-4 w-4" />}>
                  Run comparison
                </Button>
                {!consent && <span className="text-xs text-muted">Confirm the data-handling notice to run.</span>}
              </div>
            </div>
          </form>
        </CardBody>
      </Card>

      {run.isPending && <LoadingBlock rows={4} />}

      {result && !run.isPending && (
        <section aria-label="Arena results" className="space-y-4">
          <div className={cn('grid gap-4 md:grid-cols-2', result.results.length === 3 && 'xl:grid-cols-3', result.results.length >= 4 && 'xl:grid-cols-4')}>
            {result.results.map((r, i) => {
              const m = models.data?.find((x) => x.id === r.modelId);
              return (
                <Card key={`${r.modelId}-${i}`} className="flex flex-col">
                  <CardHeader
                    title={m?.name ?? r.modelId}
                    description={m?.provider.name}
                    actions={r.ok ? r.meta.demo ? <DemoBadge label="Demo" /> : <Badge tone="success">OK</Badge> : <Badge tone="danger">Error</Badge>}
                  />
                  <CardBody className="flex flex-1 flex-col gap-3">
                    {r.ok ? (
                      <>
                        <div className="max-h-80 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">{r.content || <span className="text-muted">(empty response)</span>}</div>
                        {r.meta.demo && <p className="text-xs text-muted">Demo endpoint: synthetic text, not a real model.</p>}
                        <ResponseMeta meta={r.meta} usage={r.usage} compact />
                        <div className="space-y-3 border-t border-brand-50 pt-3 dark:border-navy-700">
                          <StarRating label="Overall rating" value={ratings[r.requestId]?.rating} onChange={(v) => setDraft(r.requestId, { rating: v })} />
                          {result.criteria.map((c) => (
                            <StarRating
                              key={c}
                              size="sm"
                              label={c}
                              value={ratings[r.requestId]?.scores[c]}
                              onChange={(v) => setDraft(r.requestId, { scores: { ...(ratings[r.requestId]?.scores ?? {}), [c]: v } })}
                            />
                          ))}
                          <Field label="Notes (optional)">
                            {(id, aria) => (
                              <Textarea id={id} {...aria} rows={2} maxLength={1000} value={ratings[r.requestId]?.notes ?? ''} onChange={(e) => setDraft(r.requestId, { notes: e.target.value })} className="min-h-[60px]" />
                            )}
                          </Field>
                        </div>
                      </>
                    ) : (
                      <>
                        <InferenceErrorNotice message={r.error.message} code={r.error.code} requestId={r.requestId} />
                        <p className="num text-xs text-muted">Failed after {formatMs(r.latencyMs)}. Failed requests are not billed.</p>
                      </>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
          {result.results.some((r) => r.ok) && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {submitted && <span className="text-sm text-emerald-600 dark:text-emerald-400">Ratings saved for this session.</span>}
              <span className="text-xs text-muted">{ratedEntries.length ? `${ratedEntries.length} response(s) rated` : 'Give at least one overall rating to submit.'}</span>
              <Button onClick={submitRatings} disabled={!ratedEntries.length} loading={rate.isPending}>
                Submit ratings
              </Button>
            </div>
          )}
        </section>
      )}
      {run.error && !run.isPending && <InferenceErrorNotice {...errorInfo(run.error)} />}

      <Card>
        <CardHeader title="Arena history" description="Your organization's 20 most recent comparisons. Prompts are not stored, only their length." />
        {!canViewUsage ? (
          <CardBody>
            <p className="text-sm text-muted">Your role cannot view usage history.</p>
          </CardBody>
        ) : (
          <QueryState
            query={history}
            isEmpty={(d) => !d.data.length}
            empty={<EmptyState title="No comparisons yet" description="Run your first side-by-side comparison above." />}
          >
            {(d) => (
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Prompt</Th>
                    <Th>Models · rating · cost · latency</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((s) => (
                    <tr key={s.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(s.createdAt)}</Td>
                      <Td className="num whitespace-nowrap">{formatNumber(s.promptChars)} chars</Td>
                      <Td>
                        {s.entries.length ? (
                          <ul className="space-y-1">
                            {s.entries.map((e) => (
                              <li key={e.requestId} className="num flex flex-wrap items-center gap-x-3 text-xs">
                                <span className="font-medium text-slate-800 dark:text-slate-100">{e.modelId}</span>
                                <span>{e.rating ? `${e.rating}/5` : 'unrated'}</span>
                                <span>{formatUsd(e.costUsd, { precise: true })}</span>
                                <span>{formatMs(e.latencyMs)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-muted">All requests failed</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </QueryState>
        )}
      </Card>
    </div>
  );
}
