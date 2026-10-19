import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FlaskConical, Play } from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, DemoBadge, EmptyState, Field, Input, QueryState, Select, Table, Td, Th, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatMs, formatNumber, formatUsd } from '@/lib/format';
import { useActiveOrg, useCan } from '@/features/auth/useSession';
import type { BenchmarkResult } from '@/types/api';
import { ModelSlots, useApiModels } from './shared';
import type { BenchmarkRunItem, BenchmarkRunResponse } from './types';

export function useRunBenchmark(onDone?: (items: BenchmarkRunItem[]) => void) {
  const org = useActiveOrg();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (modelIds: string[]) => api.post<BenchmarkRunResponse>('/api/playground/benchmarks/run', { modelIds }),
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.ok).length;
      if (ok === res.results.length) toast.success('Benchmark complete', `${ok} model(s) evaluated.`);
      else toast.info('Benchmark finished with errors', `${ok} of ${res.results.length} model(s) completed.`);
      void qc.invalidateQueries({ queryKey: ['playground', org?.id, 'benchmarks-mine'] });
      onDone?.(res.results);
    },
    onError: (err) => toast.error('Benchmark failed', errorMessage(err)),
  });
}

function scorePct(b: Pick<BenchmarkResult, 'score'>) {
  return `${(b.score * 100).toFixed(0)}%`;
}

export function BenchmarkRunResults({ items, modelName }: { items: BenchmarkRunItem[]; modelName: (id: string) => string }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Model</Th>
          <Th>Score</Th>
          <Th>Sample</Th>
          <Th>Cost</Th>
          <Th>Avg latency</Th>
          <Th>Data</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.modelId}>
            <Td className="font-medium text-slate-900 dark:text-white">{modelName(r.modelId)}</Td>
            {r.ok ? (
              <>
                <Td className="num">{scorePct(r.result)}</Td>
                <Td className="num">n={r.result.sampleSize}</Td>
                <Td className="num">{formatUsd(r.result.costUsd, { precise: true })}</Td>
                <Td className="num">{formatMs(r.result.avgLatencyMs)}</Td>
                <Td>{r.result.isDemo ? <DemoBadge label="Demo · synthetic" /> : <Badge>Live</Badge>}</Td>
              </>
            ) : (
              <Td colSpan={5}>
                <span role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {r.error}
                </span>
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function ResultsTable({ rows, showVisibility }: { rows: BenchmarkResult[]; showVisibility?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-8">
            <span className="sr-only">Details</span>
          </Th>
          <Th>Model</Th>
          <Th>Benchmark</Th>
          <Th>Score</Th>
          <Th>Sample</Th>
          <Th>Cost</Th>
          <Th>Avg latency</Th>
          <Th>Run</Th>
          <Th>Data</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => {
          const expanded = open === b.id;
          return (
            <Fragment key={b.id}>
              <tr>
                <Td>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : b.id)}
                    aria-expanded={expanded}
                    aria-controls={`bench-${b.id}`}
                    aria-label={`${expanded ? 'Hide' : 'Show'} method and limitations for ${b.modelName ?? b.modelId}`}
                    className="rounded p-1 text-slate-500 hover:bg-brand-50 dark:hover:bg-navy-700"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </Td>
                <Td className="font-medium text-slate-900 dark:text-white">
                  <Link to={`/models/${encodeURIComponent(b.modelId)}`} className="hover:text-brand-700 hover:underline dark:hover:text-brand-300">
                    {b.modelName ?? b.modelId}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {b.benchmark} <span className="text-muted">v{b.version}</span>
                </Td>
                <Td className="num font-medium">{scorePct(b)}</Td>
                <Td className="num">n={b.sampleSize}</Td>
                <Td className="num">{formatUsd(b.costUsd, { precise: true })}</Td>
                <Td className="num">{formatMs(b.avgLatencyMs)}</Td>
                <Td className="whitespace-nowrap">{formatDate(b.runAt)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {b.isDemo ? <DemoBadge label="Demo" /> : <Badge>Live</Badge>}
                    {showVisibility && <Badge tone={b.isPublic ? 'cyan' : 'neutral'}>{b.isPublic ? 'Public' : 'Private'}</Badge>}
                  </div>
                </Td>
              </tr>
              {expanded && (
                <tr id={`bench-${b.id}`}>
                  <Td colSpan={9} className="bg-brand-50/30 dark:bg-navy-900/40">
                    <dl className="grid gap-3 text-sm md:grid-cols-3">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Dataset</dt>
                        <dd className="mt-0.5">{b.datasetDescription}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Method</dt>
                        <dd className="mt-0.5">{b.method}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Limitations</dt>
                        <dd className="mt-0.5">{b.limitations}</dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs text-muted">Score unit: {b.scoreUnit}. Run {formatDateTime(b.runAt)}.</p>
                  </Td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}

export function BenchmarksTab() {
  const org = useActiveOrg();
  const canInfer = useCan('inference:use');
  const canViewUsage = useCan('usage:view');
  const models = useApiModels();
  const [modelFilter, setModelFilter] = useState('');
  const [minScore, setMinScore] = useState('');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [selection, setSelection] = useState<string[]>(['']);
  const [lastRun, setLastRun] = useState<BenchmarkRunItem[] | null>(null);
  const runBench = useRunBenchmark(setLastRun);

  const pub = useQuery({
    queryKey: ['playground', 'benchmarks-public'],
    queryFn: () => api.get<{ data: BenchmarkResult[] }>('/api/benchmarks'),
    staleTime: 60_000,
  });
  const mine = useQuery({
    queryKey: ['playground', org?.id, 'benchmarks-mine'],
    queryFn: () => api.get<{ data: BenchmarkResult[] }>('/api/playground/benchmarks/mine'),
    enabled: Boolean(org) && canViewUsage,
  });

  const modelOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of pub.data?.data ?? []) map.set(b.modelId, b.modelName ?? b.modelId);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pub.data]);

  const minScoreN = minScore.trim() === '' ? null : Number(minScore);
  const filter = (rows: BenchmarkResult[]) =>
    rows.filter(
      (b) => (!modelFilter || b.modelId === modelFilter) && (minScoreN === null || !Number.isFinite(minScoreN) || b.score * 100 >= minScoreN) && (includeDemo || !b.isDemo),
    );

  const nameOf = (id: string) => models.data?.find((m) => m.id === id)?.name ?? id;
  const chosen = selection.filter(Boolean);

  return (
    <div className="space-y-6">
      <Alert title="Methodology & limitations">
        Results come from <strong>nexovra-arith-smoke</strong>: 20 deterministic two-operand integer arithmetic questions, each sent once with temperature 0 through the normal routing
        pipeline and graded by exact match on the last integer in the reply. It measures basic arithmetic and instruction following only. It is <em>not</em> a measure of general quality,
        reasoning, coding or factual accuracy, and n=20 is a small sample. Results from demo endpoints are synthetic and reflect their configured accuracy, not a real model.
      </Alert>

      <Card>
        <CardHeader title="Public results" description="Every row shows the dataset, method and limitations it was produced with (expand a row)." />
        <div className="flex flex-wrap items-end gap-3 border-b border-brand-50 px-5 py-3 dark:border-navy-700">
          <Field label="Model" className="w-full sm:w-64">
            {(id, aria) => (
              <Select id={id} {...aria} value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
                <option value="">All models</option>
                {modelOptions.map(([id2, name]) => (
                  <option key={id2} value={id2}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Min score (%)" className="w-32">
            {(id, aria) => <Input id={id} {...aria} type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} className="num" />}
          </Field>
          <Checkbox className="pb-2.5" label="Include demo results" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
        </div>
        <QueryState
          query={pub}
          isEmpty={(d) => !filter(d.data).length}
          empty={<EmptyState icon={<FlaskConical className="h-5 w-5" aria-hidden />} title="No benchmark results" description={pub.data?.data.length ? 'No results match these filters.' : 'No public benchmark results have been published yet.'} />}
        >
          {(d) => <ResultsTable rows={filter(d.data)} />}
        </QueryState>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Run a private benchmark" description="Results are visible only to this organization." />
          <CardBody className="space-y-4">
            <ModelSlots models={models.data ?? []} value={selection} onChange={setSelection} min={1} max={4} disabled={runBench.isPending} />
            <Alert tone="warning">
              Each model receives 20 short requests billed to your organization balance at the routed offer's price. Limited to 6 runs per hour.
            </Alert>
            {!canInfer && <p className="text-sm text-muted">Your role cannot run inference.</p>}
            <Button
              className="w-full"
              leftIcon={<Play className="h-4 w-4" />}
              disabled={!canInfer || !chosen.length || chosen.length !== selection.length}
              loading={runBench.isPending}
              onClick={() => runBench.mutate(chosen)}
            >
              {runBench.isPending ? 'Running… (may take a minute)' : 'Run benchmark'}
            </Button>
          </CardBody>
        </Card>

        <div className="space-y-6">
          {lastRun && (
            <Card>
              <CardHeader title="Latest run" />
              <BenchmarkRunResults items={lastRun} modelName={nameOf} />
            </Card>
          )}
          <Card>
            <CardHeader title="My runs" description="Benchmarks run by this organization (latest 50)." />
            {!canViewUsage ? (
              <CardBody>
                <p className="text-sm text-muted">Your role cannot view usage history.</p>
              </CardBody>
            ) : (
              <QueryState query={mine} isEmpty={(d) => !d.data.length} empty={<EmptyState title="No private runs yet" description="Run a benchmark to measure models on your own balance." />}>
                {(d) => <ResultsTable rows={d.data} showVisibility />}
              </QueryState>
            )}
          </Card>
          <p className="text-xs text-muted">
            {formatNumber(pub.data?.data.length ?? 0)} public result(s) loaded. Scores are only comparable within the same benchmark and version.
          </p>
        </div>
      </div>
    </div>
  );
}
