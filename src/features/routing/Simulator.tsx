import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { FlaskConical, Play } from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, ErrorState, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { formatUsd } from '@/lib/format';
import { numberField, toNum } from '@/features/dashboard/shared';
import { useApiModels } from '@/features/usage/hooks';
import { TraceDetails } from '@/features/usage/RequestTraceModal';
import { MODE_INFO, ROUTING_MODES, type RoutingPolicy, type SimulateResponse } from './types';

const schema = z.object({
  model: z.string().min(1, 'Choose a model'),
  policyId: z.string(),
  stream: z.boolean(),
  promptTokens: numberField({ label: 'Prompt tokens', min: 1, max: 2_000_000, int: true }),
  maxTokens: numberField({ label: 'Max tokens', min: 1, max: 200_000, int: true }),
  mode: z.union([z.literal(''), z.enum(ROUTING_MODES)]),
  minDiscount: numberField({ label: 'Min discount', min: 0, max: 100 }),
  maxLatency: numberField({ label: 'Max latency', min: 1, max: 600_000, int: true }),
  maxCost: numberField({ label: 'Max cost', min: 0, exclusiveMin: true, max: 10_000 }),
});
type SimForm = z.infer<typeof schema>;

export function RoutingSimulator({ policies }: { policies: RoutingPolicy[] }) {
  const models = useApiModels();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SimForm>({
    resolver: zodResolver(schema),
    defaultValues: { model: 'auto', policyId: '', stream: false, promptTokens: '500', maxTokens: '500', mode: '', minDiscount: '', maxLatency: '', maxCost: '' },
  });

  const simulate = useMutation({
    mutationFn: (v: SimForm) => {
      const overrides: Record<string, unknown> = {};
      if (v.mode) overrides.routing_mode = v.mode;
      if (toNum(v.minDiscount) !== null) overrides.min_discount_pct = toNum(v.minDiscount);
      if (toNum(v.maxLatency) !== null) overrides.max_latency_ms = toNum(v.maxLatency);
      if (toNum(v.maxCost) !== null) overrides.max_cost_usd = toNum(v.maxCost);
      return api.post<SimulateResponse>('/api/routing/simulate', {
        model: v.model,
        stream: v.stream,
        ...(toNum(v.promptTokens) !== null && { promptTokens: toNum(v.promptTokens) }),
        ...(toNum(v.maxTokens) !== null && { maxTokens: toNum(v.maxTokens) }),
        ...(v.policyId && { policyId: v.policyId }),
        ...(Object.keys(overrides).length > 0 && { overrides }),
      });
    },
  });

  const res = simulate.data;
  const top = res?.trace.ranked[0];

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden /> Routing simulator
          </span>
        }
        description="Dry run: see which offers would be chosen and why. Nothing is sent to a seller and nothing is billed."
      />
      <CardBody>
        <form noValidate onSubmit={handleSubmit((v) => simulate.mutate(v))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Model" error={errors.model?.message}>
              {(id, aria) => (
                <Select id={id} {...aria} {...register('model')}>
                  <option value="auto">auto (any chat model)</option>
                  {models.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Policy">
              {(id, aria) => (
                <Select id={id} {...aria} {...register('policyId')}>
                  <option value="">Default resolution</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Prompt tokens" error={errors.promptTokens?.message}>
              {(id, aria) => <Input id={id} {...aria} inputMode="numeric" {...register('promptTokens')} />}
            </Field>
            <Field label="Max output tokens" error={errors.maxTokens?.message}>
              {(id, aria) => <Input id={id} {...aria} inputMode="numeric" {...register('maxTokens')} />}
            </Field>
          </div>
          <Checkbox label="Streaming request" description="Only offers with verified streaming support are eligible." {...register('stream')} />

          <details className="rounded-xl border border-brand-100 p-4 dark:border-navy-600">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">Request-level overrides (optional)</summary>
            <p className="mt-2 text-xs text-muted">Same as the <code className="font-mono">nexovra</code> body field. Overrides can change the mode but only tighten policy limits.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Routing mode">
                {(id, aria) => (
                  <Select id={id} {...aria} {...register('mode')}>
                    <option value="">From policy</option>
                    {ROUTING_MODES.map((m) => (
                      <option key={m} value={m}>
                        {MODE_INFO[m].label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Min discount (%)" error={errors.minDiscount?.message}>
                {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="None" {...register('minDiscount')} />}
              </Field>
              <Field label="Max latency (ms)" error={errors.maxLatency?.message}>
                {(id, aria) => <Input id={id} {...aria} inputMode="numeric" placeholder="None" {...register('maxLatency')} />}
              </Field>
              <Field label="Max cost (USD)" error={errors.maxCost?.message} hint="At request time this caps max_tokens per offer; the dry-run ranking does not apply it.">
                {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="None" {...register('maxCost')} />}
              </Field>
            </div>
          </details>

          <Button type="submit" loading={simulate.isPending} leftIcon={<Play className="h-4 w-4" aria-hidden />}>
            Simulate routing
          </Button>
        </form>

        {simulate.error && <ErrorState error={simulate.error} title="Simulation failed" className="mt-4 rounded-xl border border-red-100 dark:border-red-900" />}

        {res && (
          <div className="mt-6 border-t border-brand-50 pt-6 dark:border-navy-700" aria-live="polite">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Policy used:</span>
              <Badge tone="brand">{res.policy.name}</Badge>
              <Badge tone="cyan">{MODE_INFO[res.policy.mode]?.label ?? res.policy.mode}</Badge>
              {res.policy.id === null && <span className="text-xs text-muted">(platform default - no organization policy)</span>}
            </div>
            {top ? (
              <Alert tone="success" className="mb-4" title={`Would route to ${top.seller} · ${top.model}`}>
                Estimated cost {formatUsd(top.est_cost_usd, { precise: true })}
                {top.baseline_est_usd !== null && ` vs. ${formatUsd(top.baseline_est_usd, { precise: true })} baseline reference`}. {res.trace.ranked.length - 1} fallback offer
                {res.trace.ranked.length - 1 === 1 ? '' : 's'} ranked behind it.
              </Alert>
            ) : (
              <Alert tone="warning" className="mb-4" title="No eligible offer">
                A real request with these settings would be rejected. Review the rejection reasons below and relax the constraints.
              </Alert>
            )}
            <TraceDetails trace={res.trace} selectedOfferId={top?.offer_id ?? null} selectedLabel="first choice" />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
