import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Switch,
  Table,
  Td,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatUsd } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { numberField, numStr, ProgressBar, toNum, useOrgId, useOrgProjects } from '@/features/dashboard/shared';
import type { Budget, BudgetResponse } from './types';

const thresholdsField = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    if (v === '') return;
    const parts = v.split(/[,\s]+/).filter(Boolean);
    if (parts.length > 6) ctx.addIssue({ code: 'custom', message: 'At most 6 thresholds' });
    else if (parts.some((p) => !/^\d+$/.test(p) || Number(p) < 1 || Number(p) > 100)) ctx.addIssue({ code: 'custom', message: 'Use whole percentages between 1 and 100, separated by commas' });
  });

const budgetSchema = z.object({
  dailyLimitUsd: numberField({ label: 'Daily limit', min: 0, exclusiveMin: true, max: 1_000_000 }),
  monthlyLimitUsd: numberField({ label: 'Monthly limit', min: 0, exclusiveMin: true, max: 10_000_000 }),
  maxPerRequestUsd: numberField({ label: 'Max per request', min: 0, exclusiveMin: true, max: 10_000 }),
  maxPerTaskUsd: numberField({ label: 'Max per task', min: 0, exclusiveMin: true, max: 100_000 }),
  alertThresholds: thresholdsField,
  hardLimit: z.boolean(),
});
type BudgetForm = z.infer<typeof budgetSchema>;

const parseThresholds = (v: string) => [...new Set(v.split(/[,\s]+/).filter(Boolean).map(Number))].sort((a, b) => a - b);

function toForm(b: Budget | null | undefined): BudgetForm {
  return {
    dailyLimitUsd: numStr(b?.dailyLimitUsd),
    monthlyLimitUsd: numStr(b?.monthlyLimitUsd),
    maxPerRequestUsd: numStr(b?.maxPerRequestUsd),
    maxPerTaskUsd: numStr(b?.maxPerTaskUsd),
    alertThresholds: (b?.alertThresholds ?? [50, 80, 100]).join(', '),
    hardLimit: b?.hardLimit ?? true,
  };
}

/** Smart Budget Guard: organization and project spend limits enforced server-side before dispatch. */
export function BudgetGuard() {
  const orgId = useOrgId();
  const canManage = useCan('budget:manage');
  const toast = useToast();
  const qc = useQueryClient();
  const projects = useOrgProjects();
  const [scope, setScope] = useState<string>('org');
  const [deleting, setDeleting] = useState<(Budget & { projectName?: string }) | null>(null);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const query = useQuery({
    queryKey: ['budget', orgId],
    queryFn: () => api.get<BudgetResponse>('/api/billing/budget'),
    enabled: Boolean(orgId),
  });
  const data = query.data;
  const current = useMemo<Budget | null>(() => {
    if (!data) return null;
    if (scope === 'org') return data.budget;
    return data.projectBudgets.find((b) => b.projectId === scope) ?? null;
  }, [data, scope]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<BudgetForm>({ resolver: zodResolver(budgetSchema), defaultValues: toForm(null) });

  // Reset only when the scope or the stored budget actually changes, so background refetches don't wipe edits.
  const currentKey = `${scope}:${current?.id ?? 'none'}:${current?.updatedAt ?? ''}`;
  useEffect(() => {
    reset(toForm(current));
  }, [currentKey, reset]); // `current` is captured via currentKey

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['budget', orgId] });
    qc.invalidateQueries({ queryKey: ['dashboard-summary', orgId] });
  };

  const save = useMutation({
    mutationFn: (v: BudgetForm) =>
      api.put<{ budget: Budget }>('/api/billing/budget', {
        projectId: scope === 'org' ? null : scope,
        dailyLimitUsd: toNum(v.dailyLimitUsd),
        monthlyLimitUsd: toNum(v.monthlyLimitUsd),
        maxPerRequestUsd: toNum(v.maxPerRequestUsd),
        maxPerTaskUsd: toNum(v.maxPerTaskUsd),
        alertThresholds: parseThresholds(v.alertThresholds),
        hardLimit: v.hardLimit,
      }),
    onSuccess: () => {
      toast.success('Budget saved', scope === 'org' ? 'Organization limits apply to new requests immediately.' : 'Project limits apply to new requests immediately.');
      invalidate();
    },
    onError: (err) => toast.error('Could not save budget', errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/billing/budget/${id}`),
    onSuccess: () => {
      toast.success('Budget removed');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => toast.error('Could not remove budget', errorMessage(err)),
  });

  const hardLimit = watch('hardLimit');
  const thresholdsPreview = (() => {
    const v = watch('alertThresholds');
    return thresholdsField.safeParse(v).success && v.trim() ? parseThresholds(v) : [];
  })();
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? data?.projectBudgets.find((b) => b.projectId === id)?.projectName ?? 'Project';

  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden /> Smart Budget Guard
          </span>
        }
        description="Daily, monthly, per-request and per-task limits checked before every request is dispatched."
      />
      {query.isLoading ? (
        <LoadingBlock rows={5} className="p-5" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load budget" />
      ) : data ? (
        <CardBody className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <SpendMeter label="Today (UTC)" spent={data.daySpentUsd} limit={data.budget?.dailyLimitUsd ?? null} />
            <SpendMeter label="This month (UTC)" spent={data.monthSpentUsd} limit={data.budget?.monthlyLimitUsd ?? null} />
            <div className="rounded-xl border border-brand-100 p-4 dark:border-navy-600">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Held by in-flight requests</p>
              <p className="num mt-1 text-xl font-semibold text-slate-900 dark:text-white">{formatUsd(data.inFlightUsd)}</p>
              <p className="mt-1 text-xs text-muted">Counted against limits until each request settles.</p>
            </div>
          </div>

          <Alert tone="info" title="How limits are enforced">
            {data.notes.enforcement} {data.notes.inFlight}
          </Alert>

          <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="w-full sm:w-72">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Budget scope</span>
                <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="org">Organization (all requests)</option>
                  {projects.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      Project: {p.name}
                    </option>
                  ))}
                </Select>
              </label>
              {current ? <Badge tone="brand">Configured · updated {formatDateTime(current.updatedAt)}</Badge> : <Badge>Not configured</Badge>}
            </div>
            {scope !== 'org' && <p className="text-xs text-muted">Project budgets apply to requests made with keys assigned to this project, in addition to the organization budget.</p>}

            <fieldset disabled={!canManage} className="space-y-4 disabled:opacity-80">
              <legend className="sr-only">Budget limits</legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Daily limit (USD)" error={errors.dailyLimitUsd?.message} hint="Resets 00:00 UTC">
                  {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="No limit" {...register('dailyLimitUsd')} />}
                </Field>
                <Field label="Monthly limit (USD)" error={errors.monthlyLimitUsd?.message} hint="Resets on the 1st (UTC)">
                  {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="No limit" {...register('monthlyLimitUsd')} />}
                </Field>
                <Field label="Max per request (USD)" error={errors.maxPerRequestUsd?.message} hint="Caps max_tokens to fit">
                  {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="No limit" {...register('maxPerRequestUsd')} />}
                </Field>
                <Field
                  label="Max per task (USD)"
                  error={errors.maxPerTaskUsd?.message}
                  hint={
                    <>
                      Group calls with <code className="font-mono">X-Nexovra-Task-Id</code> or <code className="font-mono">nexovra.task_id</code>
                    </>
                  }
                >
                  {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="No limit" {...register('maxPerTaskUsd')} />}
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Alert thresholds (% of daily/monthly limit)" error={errors.alertThresholds?.message} hint="Comma-separated, 1–100, up to 6. Alerts go to the alert center and subscribed webhooks.">
                  {(id, aria) => <Input id={id} {...aria} placeholder="50, 80, 100" {...register('alertThresholds')} />}
                </Field>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Enforcement</p>
                  <div className="flex items-start gap-3 rounded-lg border border-brand-100 p-3 dark:border-navy-600">
                    <Switch checked={hardLimit} onChange={(v) => setValue('hardLimit', v, { shouldDirty: true })} label="Hard limit" disabled={!canManage} />
                    <div className="text-sm">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{hardLimit ? 'Hard limit - block new requests' : 'Soft limit - alerts only'}</p>
                      <p className="text-xs text-muted">{hardLimit ? 'Requests that would exceed a limit are rejected with HTTP 402 before they are sent.' : 'Requests continue; you are notified when thresholds are crossed.'}</p>
                    </div>
                  </div>
                </div>
              </div>
              {thresholdsPreview.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" aria-label="Alert thresholds preview">
                  {thresholdsPreview.map((t) => (
                    <Badge key={t} tone={t >= 100 ? 'danger' : t >= 80 ? 'warning' : 'cyan'}>
                      {t}%
                    </Badge>
                  ))}
                </div>
              )}
            </fieldset>

            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={save.isPending} disabled={!isDirty && Boolean(current)}>
                  {current ? 'Save budget' : 'Create budget'}
                </Button>
                {isDirty && (
                  <Button variant="ghost" onClick={() => reset(toForm(current))}>
                    Discard changes
                  </Button>
                )}
                {current && (
                  <Button variant="outline" className="ml-auto text-red-600 dark:text-red-400" onClick={() => setDeleting({ ...current, projectName: scope === 'org' ? undefined : projectName(scope) })} leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}>
                    Remove {scope === 'org' ? 'organization' : 'project'} budget
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">Your role can view but not change budgets (requires budget:manage).</p>
            )}
          </form>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Project budgets</h4>
            {data.projectBudgets.length === 0 ? (
              <EmptyState className="rounded-xl border border-dashed border-brand-100 py-8 dark:border-navy-600" title="No project budgets" description="Pick a project in the scope selector above to give it its own limits." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-brand-100 dark:border-navy-600">
                <Table>
                  <thead>
                    <tr>
                      <Th>Project</Th>
                      <Th className="text-right">Daily</Th>
                      <Th className="text-right">Monthly</Th>
                      <Th className="text-right">Per request</Th>
                      <Th className="text-right">Per task</Th>
                      <Th>Alerts</Th>
                      <Th>Mode</Th>
                      <Th className="text-right">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projectBudgets.map((b) => (
                      <tr key={b.id}>
                        <Td>
                          <button type="button" className="text-brand-700 hover:underline dark:text-brand-300" onClick={() => b.projectId && setScope(b.projectId)}>
                            {b.projectName ?? projectName(b.projectId ?? '')}
                          </button>
                        </Td>
                        <Td className="num text-right">{formatUsd(b.dailyLimitUsd)}</Td>
                        <Td className="num text-right">{formatUsd(b.monthlyLimitUsd)}</Td>
                        <Td className="num text-right">{formatUsd(b.maxPerRequestUsd)}</Td>
                        <Td className="num text-right">{formatUsd(b.maxPerTaskUsd)}</Td>
                        <Td className="num text-xs">{b.alertThresholds.map((t) => `${t}%`).join(', ') || '—'}</Td>
                        <Td>{b.hardLimit ? <Badge tone="brand">hard</Badge> : <Badge>alerts only</Badge>}</Td>
                        <Td className="text-right">
                          {canManage && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Delete budget for ${b.projectName ?? 'project'}`} onClick={() => setDeleting(b)}>
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        </CardBody>
      ) : null}

      <Modal
        open={Boolean(deleting)}
        onClose={closeDelete}
        title="Remove budget?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Remove budget
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {deleting?.projectId ? (
            <>
              The budget for project <span className="font-semibold">{deleting.projectName ?? 'this project'}</span> will be deleted. Requests in this project will only be limited by the organization budget.
            </>
          ) : (
            'The organization budget will be deleted. Requests will no longer be limited by daily, monthly, per-request or per-task caps (API key limits still apply).'
          )}
        </p>
      </Modal>
    </Card>
  );
}

function SpendMeter({ label, spent, limit }: { label: string; spent: number; limit: number | null }) {
  return (
    <div className="rounded-xl border border-brand-100 p-4 dark:border-navy-600">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="num mt-1 text-xl font-semibold text-slate-900 dark:text-white">
        {formatUsd(spent)}
        <span className="text-sm font-normal text-muted"> / {limit != null ? formatUsd(limit) : 'no limit'}</span>
      </p>
      {limit != null ? (
        <>
          <ProgressBar value={spent} max={limit} label={`${label} budget used`} className="mt-2" />
          <p className={`num mt-1 text-xs ${spent >= limit ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>{formatUsd(Math.max(0, limit - spent))} remaining</p>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted">Set a limit below to track remaining budget.</p>
      )}
    </div>
  );
}
