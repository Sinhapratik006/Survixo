import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronDown, ExternalLink, FlaskConical, Sparkles, Swords } from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, DemoBadge, EmptyState, Field, Input, Modal, Textarea, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatNumber, formatPricePerM } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { BenchmarkRunResults, useRunBenchmark } from './BenchmarksTab';
import { CAPABILITIES, InferenceErrorNotice, errorInfo, parseOptionalNumber, type CapabilityId } from './shared';
import type { BenchmarkRunItem, MatchResponse } from './types';

export function MatchTab({ onCompare }: { onCompare: (modelIds: string[]) => void }) {
  const toast = useToast();
  const canInfer = useCan('inference:use');
  const canView = useCan('usage:view');
  const [task, setTask] = useState('');
  const [caps, setCaps] = useState<CapabilityId[]>([]);
  const [maxPrice, setMaxPrice] = useState('');
  const [maxLatency, setMaxLatency] = useState('');
  const [confirmEval, setConfirmEval] = useState(false);
  const [evalResults, setEvalResults] = useState<BenchmarkRunItem[] | null>(null);

  const maxPriceN = parseOptionalNumber(maxPrice);
  const maxLatencyN = parseOptionalNumber(maxLatency);
  const errors = {
    task: task.trim().length > 0 && task.trim().length < 5 ? 'Describe the task in at least 5 characters' : undefined,
    maxPrice: maxPriceN !== undefined && (Number.isNaN(maxPriceN) || maxPriceN <= 0 || maxPriceN > 10_000) ? 'Greater than 0, at most 10,000' : undefined,
    maxLatency: maxLatencyN !== undefined && (Number.isNaN(maxLatencyN) || !Number.isInteger(maxLatencyN) || maxLatencyN <= 0 || maxLatencyN > 600_000) ? 'Whole ms, at most 600,000' : undefined,
  };

  const match = useMutation({
    mutationFn: () =>
      api.post<MatchResponse>('/api/playground/assistant/match', {
        task: task.trim(),
        ...(caps.length ? { requiredCapabilities: caps } : {}),
        ...(maxPriceN !== undefined ? { maxOutputPriceUsd: maxPriceN } : {}),
        ...(maxLatencyN !== undefined ? { maxLatencyMs: maxLatencyN } : {}),
      }),
    onSuccess: () => setEvalResults(null),
    onError: (err) => toast.error('Could not get recommendations', errorMessage(err)),
  });
  const runEval = useRunBenchmark(setEvalResults);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (task.trim().length < 5 || errors.maxPrice || errors.maxLatency) return;
    match.mutate();
  };

  const data = match.data;
  const top = data?.recommendations.slice(0, 4).map((r) => r.model.id) ?? [];
  const nameOf = (id: string) => data?.recommendations.find((r) => r.model.id === id)?.model.name ?? id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Model Match Assistant" description="Describe your workload; the assistant filters the catalog by hard requirements and ranks the rest by price, measured latency and measured quality." />
        <CardBody>
          <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Field label="Task description" error={errors.task} hint="Mention input size, formats, speed and accuracy needs. Detected signals are shown with the results.">
              {(id, aria) => (
                <Textarea id={id} {...aria} rows={6} maxLength={2000} value={task} onChange={(e) => setTask(e.target.value)} placeholder="Summarize 200-page PDFs with accurate citations at low cost." />
              )}
            </Field>
            <div className="space-y-3">
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Required capabilities (optional)</legend>
                <div className="grid grid-cols-2 gap-2">
                  {CAPABILITIES.map((c) => (
                    <Checkbox key={c.id} label={c.label} checked={caps.includes(c.id)} onChange={(e) => setCaps((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                  ))}
                </div>
              </fieldset>
              <Field label="Max output price ($ / 1M tokens)" error={errors.maxPrice}>
                {(id, aria) => <Input id={id} {...aria} type="number" min={0} step="0.01" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="num" />}
              </Field>
              <Field label="Max median latency (ms)" error={errors.maxLatency}>
                {(id, aria) => <Input id={id} {...aria} type="number" min={1} value={maxLatency} onChange={(e) => setMaxLatency(e.target.value)} className="num" />}
              </Field>
              <Button type="submit" className="w-full" loading={match.isPending} disabled={!canView || task.trim().length < 5} leftIcon={<Sparkles className="h-4 w-4" />}>
                Find models
              </Button>
              {!canView && <p className="text-xs text-muted">Your role cannot use the assistant (requires usage:view).</p>}
            </div>
          </form>
        </CardBody>
      </Card>

      {match.error && <InferenceErrorNotice {...errorInfo(match.error)} />}

      {data && (
        <>
          <Alert tone="warning" title="These are not test results">
            The assistant has not run any of these models. Rankings use catalog data, current offer prices and existing measurements only.
            {evalResults ? ' The evaluation results below come from a tiny arithmetic smoke benchmark you just ran.' : ' Run a small evaluation or compare in the Arena before relying on them.'}
          </Alert>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="What we detected" />
              <CardBody className="space-y-4 text-sm">
                <ul className="space-y-1.5">
                  {data.analysis.signals.map((s) => (
                    <li key={s} className="flex gap-2">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Required capabilities</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {data.analysis.requiredCapabilities.length ? data.analysis.requiredCapabilities.map((c) => <Badge key={c} tone="cyan">{c}</Badge>) : <span className="text-muted">None</span>}
                  </div>
                </div>
                {data.analysis.minContextTokens !== null && (
                  <p className="num">
                    Minimum context: <strong>~{formatNumber(data.analysis.minContextTokens)}</strong> tokens
                  </p>
                )}
                <p className="text-xs text-muted">{data.method}</p>
              </CardBody>
            </Card>

            <div className="space-y-4 lg:col-span-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" leftIcon={<Swords className="h-4 w-4" />} disabled={top.length < 2} onClick={() => onCompare(top)}>
                  Compare top picks in Arena
                </Button>
                <Button variant="outline" leftIcon={<FlaskConical className="h-4 w-4" />} disabled={!top.length || !canInfer} loading={runEval.isPending} onClick={() => setConfirmEval(true)}>
                  Run small evaluation
                </Button>
              </div>
              {!data.recommendations.length ? (
                <Card>
                  <EmptyState title="No model meets these requirements" description="Relax the requirements or check the excluded models below for the reasons." />
                </Card>
              ) : (
                data.recommendations.map((r, i) => (
                  <Card key={r.model.id}>
                    <CardBody className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted">#{i + 1} · {r.model.provider.name}</p>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{r.model.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {(r.model.isDemo || r.model.bestOffer?.isDemo) && <DemoBadge />}
                          <Badge tone="brand" className="num" title="Weighted score between 0 and 1">
                            Score {r.score.toFixed(2)}
                          </Badge>
                        </div>
                      </div>
                      {r.model.bestOffer && (
                        <p className="num text-sm">
                          Best offer: <strong>{formatPricePerM(r.model.bestOffer.inputPerM)}</strong> in / <strong>{formatPricePerM(r.model.bestOffer.outputPerM)}</strong> out per 1M tokens
                          <span className="text-muted"> · {r.model.bestOffer.sellerName}</span>
                        </p>
                      )}
                      <ul className="space-y-1 text-sm">
                        {r.reasons.map((x) => (
                          <li key={x} className="flex gap-2">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                            <span>{x}</span>
                          </li>
                        ))}
                        {r.warnings.map((x) => (
                          <li key={x} className="flex gap-2 text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span>{x}</span>
                          </li>
                        ))}
                      </ul>
                      <Link to={`/models/${encodeURIComponent(r.model.id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                        View model page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </CardBody>
                  </Card>
                ))
              )}

              {evalResults && (
                <Card>
                  <CardHeader title="Evaluation results" description="nexovra-arith-smoke: 20 arithmetic questions per model. Measures arithmetic and instruction following only." />
                  <BenchmarkRunResults items={evalResults} modelName={nameOf} />
                </Card>
              )}

              {data.excluded.length > 0 && (
                <details className="card group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Excluded models ({data.excluded.length})
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="divide-y divide-brand-50 border-t border-brand-50 dark:divide-navy-700 dark:border-navy-700">
                    {data.excluded.map((x) => (
                      <li key={x.modelId} className="px-5 py-3 text-sm">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{x.name}</p>
                        <ul className="mt-0.5 list-disc pl-5 text-muted">
                          {x.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </>
      )}

      <Modal
        open={confirmEval}
        onClose={() => setConfirmEval(false)}
        title="Run a small evaluation?"
        description="A tiny arithmetic smoke benchmark, not a quality evaluation of your task."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmEval(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmEval(false);
                runEval.mutate(top);
              }}
            >
              Run on {top.length} model{top.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>Each of these models will receive 20 short arithmetic questions through normal routing:</p>
          <ul className="list-disc pl-5">
            {top.map((id) => (
              <li key={id}>{nameOf(id)}</li>
            ))}
          </ul>
          <Alert tone="warning">The requests are billed to your organization balance. Benchmarks are limited to 6 runs per hour. Results are stored privately for this organization.</Alert>
        </div>
      </Modal>
    </div>
  );
}
