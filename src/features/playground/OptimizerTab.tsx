import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Info, PiggyBank, RefreshCw, TrendingDown } from 'lucide-react';
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingBlock, Modal, StatCard, useToast } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatUsd } from '@/lib/format';
import { useActiveOrg, useCan } from '@/features/auth/useSession';
import type { OptimizerRecommendation, OptimizerResponse, RoutingPolicySummary } from './types';

const TYPE_LABEL: Record<OptimizerRecommendation['type'], string> = {
  model_substitution: 'Model substitution',
  routing_policy: 'Routing policy',
  token_reduction: 'Token reduction',
  budget: 'Budget',
  prompt_caching: 'Prompt caching',
  batching: 'Batching',
};

const modeLabel = (m: string) => m.replace(/_/g, ' ').toLowerCase();

export function OptimizerTab({ onGoToChat }: { onGoToChat: () => void }) {
  const org = useActiveOrg();
  const canManageRouting = useCan('routing:manage');
  const qc = useQueryClient();
  const toast = useToast();
  const [applying, setApplying] = useState<OptimizerRecommendation | null>(null);

  const key = ['playground', org?.id, 'optimizer'];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<OptimizerResponse>('/api/playground/optimizer'), enabled: Boolean(org) });
  const policies = useQuery({
    queryKey: ['playground', org?.id, 'routing-policies'],
    queryFn: () => api.get<{ data: RoutingPolicySummary[] }>('/api/routing/policies'),
    enabled: Boolean(org) && Boolean(applying),
  });

  const apply = useMutation({
    mutationFn: (rec: OptimizerRecommendation) => {
      if (rec.action?.kind !== 'apply_routing_mode') throw new Error('Not an applicable recommendation');
      return api.post<{ ok: true; policy: { id: string; mode: string } }>('/api/playground/optimizer/apply', {
        recommendationId: rec.id,
        action: { kind: 'apply_routing_mode', policyId: rec.action.policyId, mode: rec.action.mode },
        confirm: true,
      });
    },
    onSuccess: (res) => {
      toast.success('Routing policy updated', `Mode is now ${modeLabel(res.policy.mode)}.`);
      setApplying(null);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['playground', org?.id, 'routing-policies'] });
    },
    onError: (err) => {
      toast.error('Could not apply recommendation', errorMessage(err));
      if (err instanceof ApiError && err.code === 'stale_recommendation') {
        setApplying(null);
        void q.refetch();
      }
    },
  });

  if (q.isLoading) return <LoadingBlock rows={5} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const data = q.data;
  if (!data) return null;

  const totalSavings = data.recommendations.reduce((s, r) => s + (r.projectedMonthlySavingsUsd ?? 0), 0);
  const noUsage = data.analyzedSpendUsd === 0 && !data.recommendations.length;
  const policy = applying?.action?.kind === 'apply_routing_mode' ? policies.data?.data.find((p) => p.id === (applying.action as { policyId: string }).policyId) : undefined;
  const targetMode = applying?.action?.kind === 'apply_routing_mode' ? applying.action.mode : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={`Spend analyzed (${data.windowDays}d)`} value={formatUsd(data.analyzedSpendUsd)} icon={<PiggyBank className="h-4 w-4" />} />
        <StatCard label="Recommendations" value={data.recommendations.length} />
        <StatCard
          label="Projected monthly savings"
          value={totalSavings > 0 ? formatUsd(totalSavings) : '-'}
          tone={totalSavings > 0 ? 'success' : 'default'}
          hint={totalSavings > 0 ? 'Sum of estimated items; alternatives may overlap' : 'No estimate available'}
          icon={<TrendingDown className="h-4 w-4" />}
        />
      </div>

      <Alert>
        <span className="inline-flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {data.note}
        </span>
      </Alert>

      {noUsage ? (
        <Card>
          <EmptyState
            title="No usage to analyze yet"
            description={`The optimizer looks at the last ${data.windowDays} days of recorded requests. Send some requests through the API or the playground, then come back.`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={onGoToChat}>Try the playground</Button>
                <ButtonLink to="/dashboard/api-keys" variant="outline">
                  Create an API key
                </ButtonLink>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recommendations</h2>
            <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => q.refetch()} loading={q.isFetching}>
              Re-analyze
            </Button>
          </div>
          {!data.recommendations.length && (
            <Card>
              <EmptyState title="Nothing to optimize right now" description="Your recent usage is already routed to the cheapest compatible offers we know of." />
            </Card>
          )}
          {data.recommendations.map((r) => (
            <Card key={r.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <Badge tone="brand">{TYPE_LABEL[r.type]}</Badge>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{r.title}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted">Projected / month</p>
                    {r.projectedMonthlySavingsUsd !== null ? (
                      <p className="num text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatUsd(r.projectedMonthlySavingsUsd)}</p>
                    ) : (
                      <p className="text-sm text-muted">Not estimated</p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{r.detail}</p>
                {r.assumptions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">Assumptions</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
                      {r.assumptions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.action && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {r.action.kind === 'link' ? (
                      <ButtonLink to={r.action.href} variant="outline" size="sm" leftIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                        {r.action.label}
                      </ButtonLink>
                    ) : (
                      <>
                        <Button size="sm" disabled={!canManageRouting} onClick={() => setApplying(r)}>
                          Review & apply
                        </Button>
                        {!canManageRouting && <span className="text-xs text-muted">Requires the routing:manage permission.</span>}
                      </>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {data.notApplicable.length > 0 && (
        <Card>
          <CardHeader title="Not applicable" />
          <CardBody>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {data.notApplicable.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Modal
        open={Boolean(applying)}
        onClose={() => !apply.isPending && setApplying(null)}
        title="Change routing mode?"
        description="Review exactly what will change before confirming."
        footer={
          <>
            <Button variant="outline" onClick={() => setApplying(null)} disabled={apply.isPending}>
              Cancel
            </Button>
            <Button onClick={() => applying && apply.mutate(applying)} loading={apply.isPending}>
              Confirm change
            </Button>
          </>
        }
      >
        {applying && targetMode && (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-slate-900 dark:text-white">{applying.title}</p>
            {policies.isLoading ? (
              <LoadingBlock rows={1} />
            ) : (
              <div className="rounded-lg border border-brand-100 p-3 dark:border-navy-600">
                <p>
                  Routing policy <strong>{policy?.name ?? 'Default policy'}</strong>
                  {policy?.isDefault && <Badge className="ml-2">default</Badge>}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  Mode:
                  <Badge>{policy ? modeLabel(policy.mode) : 'current mode'}</Badge>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  <Badge tone="cyan">{modeLabel(targetMode)}</Badge>
                </p>
              </div>
            )}
            <p>
              Every request that uses this policy (API keys and projects without their own policy) will be routed by <strong>{modeLabel(targetMode)}</strong>. Cheaper offers may have
              different latency or reliability. Nothing else changes, and you can switch back any time in Routing. The change is recorded in the audit log.
            </p>
            {applying.projectedMonthlySavingsUsd !== null && (
              <p>
                Estimated savings: <span className="num font-medium text-emerald-600 dark:text-emerald-400">{formatUsd(applying.projectedMonthlySavingsUsd)}</span> per month (estimate, not guaranteed).
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
