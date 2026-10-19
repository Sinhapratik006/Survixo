import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Field, Input, Modal, Textarea, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { numberField, numStr, splitList, toNum, useOrgId } from '@/features/dashboard/shared';
import { MODE_INFO, ROUTING_MODES, type PolicyBody, type RoutingPolicy } from './types';

const listField = z
  .string()
  .refine((v) => splitList(v).length <= 50, { message: 'At most 50 entries' })
  .refine((v) => splitList(v).every((s) => s.length <= 100), { message: 'Each entry must be at most 100 characters' });

const weight = z.number().min(0).max(1);

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60, 'At most 60 characters'),
    mode: z.enum(ROUTING_MODES),
    isDefault: z.boolean(),
    maxInputPriceUsd: numberField({ label: 'Max input price', min: 0, max: 10_000 }),
    maxOutputPriceUsd: numberField({ label: 'Max output price', min: 0, max: 10_000 }),
    minDiscountPct: numberField({ label: 'Min discount', min: 0, max: 100, int: true }),
    maxLatencyMs: numberField({ label: 'Max latency', min: 50, max: 600_000, int: true }),
    minReliability: numberField({ label: 'Min reliability', min: 0, max: 100, int: true }),
    minQualityScore: numberField({ label: 'Min quality score', min: 0, max: 1 }),
    allowedProviders: listField,
    blockedProviders: listField,
    preferredSellers: listField,
    allowDemoOffers: z.boolean(),
    maxRetries: numberField({ label: 'Max retries', min: 0, max: 5, int: true, required: true }),
    timeoutMs: numberField({ label: 'Timeout', min: 1000, max: 300_000, int: true, required: true }),
    weights: z.object({ price: weight, latency: weight, quality: weight, reliability: weight }),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'CUSTOM' && v.weights.price + v.weights.latency + v.weights.quality + v.weights.reliability <= 0)
      ctx.addIssue({ code: 'custom', path: ['weights'], message: 'At least one weight must be above zero' });
    if (v.mode === 'PREFERRED_PROVIDER' && splitList(v.preferredSellers).length === 0)
      ctx.addIssue({ code: 'custom', path: ['preferredSellers'], message: 'Add at least one preferred provider or seller for this mode' });
  });
type PolicyForm = z.infer<typeof schema>;

const DEFAULT_WEIGHTS = { price: 0.5, latency: 0.2, quality: 0.2, reliability: 0.1 };

function toForm(p?: RoutingPolicy | null): PolicyForm {
  return {
    name: p?.name ?? '',
    mode: p?.mode ?? 'LOWEST_COST',
    isDefault: p?.isDefault ?? false,
    maxInputPriceUsd: numStr(p?.maxInputPriceUsd),
    maxOutputPriceUsd: numStr(p?.maxOutputPriceUsd),
    minDiscountPct: numStr(p?.minDiscountPct),
    maxLatencyMs: numStr(p?.maxLatencyMs),
    minReliability: numStr(p?.minReliability),
    minQualityScore: numStr(p?.minQualityScore),
    allowedProviders: p?.allowedProviders.join(', ') ?? '',
    blockedProviders: p?.blockedProviders.join(', ') ?? '',
    preferredSellers: p?.preferredSellers.join(', ') ?? '',
    allowDemoOffers: p?.allowDemoOffers ?? true,
    maxRetries: String(p?.maxRetries ?? 2),
    timeoutMs: String(p?.timeoutMs ?? 30_000),
    weights: p?.weights ?? DEFAULT_WEIGHTS,
  };
}

function toBody(v: PolicyForm): PolicyBody {
  return {
    name: v.name.trim(),
    mode: v.mode,
    isDefault: v.isDefault,
    maxInputPriceUsd: toNum(v.maxInputPriceUsd),
    maxOutputPriceUsd: toNum(v.maxOutputPriceUsd),
    minDiscountPct: toNum(v.minDiscountPct),
    maxLatencyMs: toNum(v.maxLatencyMs),
    minReliability: toNum(v.minReliability),
    minQualityScore: toNum(v.minQualityScore),
    allowedProviders: splitList(v.allowedProviders),
    blockedProviders: splitList(v.blockedProviders),
    preferredSellers: splitList(v.preferredSellers),
    allowDemoOffers: v.allowDemoOffers,
    maxRetries: Number(v.maxRetries),
    timeoutMs: Number(v.timeoutMs),
    ...(v.mode === 'CUSTOM' && { weights: v.weights }),
  };
}

export function PolicyFormModal({ open, policy, onClose }: { open: boolean; policy: RoutingPolicy | null; onClose: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<PolicyForm>({ resolver: zodResolver(schema), defaultValues: toForm(null) });

  useEffect(() => {
    if (open) reset(toForm(policy));
  }, [open, policy, reset]);

  const save = useMutation({
    mutationFn: (v: PolicyForm) =>
      policy ? api.put<{ policy: RoutingPolicy }>(`/api/routing/policies/${policy.id}`, toBody(v)) : api.post<{ policy: RoutingPolicy }>('/api/routing/policies', toBody(v)),
    onSuccess: (res) => {
      toast.success(policy ? 'Policy updated' : 'Policy created', res.policy.isDefault ? `"${res.policy.name}" is your default policy.` : undefined);
      qc.invalidateQueries({ queryKey: ['routing-policies', orgId] });
      onClose();
    },
    onError: (err) => toast.error('Could not save policy', errorMessage(err)),
  });

  const mode = watch('mode');
  const weights = watch('weights');
  const weightSum = weights.price + weights.latency + weights.quality + weights.reliability;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={policy ? `Edit "${policy.name}"` : 'New routing policy'}
      description="Constraints filter offers; the mode ranks the eligible ones. Per-request overrides can only tighten limits."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="policy-form" loading={save.isPending}>
            {policy ? 'Save policy' : 'Create policy'}
          </Button>
        </>
      }
    >
      <form id="policy-form" noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.message}>
            {(id, aria) => <Input id={id} {...aria} maxLength={60} placeholder="e.g. Production - cheapest" {...register('name')} />}
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox
              label="Set as default policy"
              description={policy?.isDefault ? 'This is already the default; choose another policy as default to change it.' : 'Used when a request or project does not specify a policy.'}
              disabled={policy?.isDefault}
              {...register('isDefault')}
            />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Routing mode</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROUTING_MODES.map((m) => (
              <label
                key={m}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors',
                  mode === m ? 'border-cyan-400 bg-cyan-50/60 dark:border-cyan-700 dark:bg-cyan-950/30' : 'border-brand-100 hover:border-brand-200 dark:border-navy-600',
                )}
              >
                <input type="radio" value={m} className="mt-0.5 accent-brand-600" {...register('mode')} />
                <span>
                  <span className="block font-medium text-slate-900 dark:text-white">{MODE_INFO[m].label}</span>
                  <span className="block text-xs text-muted">{MODE_INFO[m].description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === 'CUSTOM' && (
          <fieldset className="rounded-xl border border-brand-100 p-4 dark:border-navy-600">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Custom weights</legend>
            <p className="mb-3 text-xs text-muted">Relative importance (0–1). Each factor is normalized across eligible offers; unknown quality or reliability counts as worst.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(['price', 'latency', 'quality', 'reliability'] as const).map((k) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-sm">
                    <label htmlFor={`w-${k}`} className="font-medium capitalize text-slate-700 dark:text-slate-200">
                      {k}
                    </label>
                    <span className="num text-xs text-muted">
                      {weights[k].toFixed(2)}
                      {weightSum > 0 && ` · ${Math.round((weights[k] / weightSum) * 100)}%`}
                    </span>
                  </div>
                  <input id={`w-${k}`} type="range" min={0} max={1} step={0.05} className="w-full accent-brand-600" {...register(`weights.${k}`, { valueAsNumber: true })} />
                </div>
              ))}
            </div>
            {errors.weights?.message && (
              <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
                {errors.weights.message}
              </p>
            )}
          </fieldset>
        )}

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900 dark:text-white">Constraints</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max input price ($ / 1M tokens)" error={errors.maxInputPriceUsd?.message}>
              {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="Any" {...register('maxInputPriceUsd')} />}
            </Field>
            <Field label="Max output price ($ / 1M tokens)" error={errors.maxOutputPriceUsd?.message}>
              {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="Any" {...register('maxOutputPriceUsd')} />}
            </Field>
            <Field label="Min discount vs. baseline (%)" error={errors.minDiscountPct?.message} hint="Offers without a baseline price are excluded when set">
              {(id, aria) => <Input id={id} {...aria} inputMode="numeric" placeholder="None" {...register('minDiscountPct')} />}
            </Field>
            <Field label="Max median latency (ms)" error={errors.maxLatencyMs?.message} hint="Offers without measurements are excluded when set">
              {(id, aria) => <Input id={id} {...aria} inputMode="numeric" placeholder="None" {...register('maxLatencyMs')} />}
            </Field>
            <Field label="Min reliability score (0–100)" error={errors.minReliability?.message}>
              {(id, aria) => <Input id={id} {...aria} inputMode="numeric" placeholder="None" {...register('minReliability')} />}
            </Field>
            <Field label="Min quality score (0–1)" error={errors.minQualityScore?.message} hint="Normalized benchmark score">
              {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="None" {...register('minQualityScore')} />}
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900 dark:text-white">Providers & sellers</legend>
          <p className="-mt-2 text-xs text-muted">Comma-separated provider IDs (e.g. openai, anthropic), seller slugs, or seller organization IDs.</p>
          <Field label="Allowed providers" error={errors.allowedProviders?.message} hint="Leave empty to allow all">
            {(id, aria) => <Textarea id={id} {...aria} className="!min-h-[60px]" placeholder="All providers" {...register('allowedProviders')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Blocked providers" error={errors.blockedProviders?.message}>
              {(id, aria) => <Textarea id={id} {...aria} className="!min-h-[60px]" placeholder="None" {...register('blockedProviders')} />}
            </Field>
            <Field
              label="Preferred providers / sellers"
              error={errors.preferredSellers?.message}
              hint={mode === 'PREFERRED_PROVIDER' ? 'Ranked first in this mode' : 'Used by the Preferred provider mode'}
            >
              {(id, aria) => <Textarea id={id} {...aria} className="!min-h-[60px]" placeholder="None" {...register('preferredSellers')} />}
            </Field>
          </div>
          <Checkbox label="Allow demo offers" description="Demo offers return simulated responses. Disable for production traffic." {...register('allowDemoOffers')} />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900 dark:text-white">Failover</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max retries (0–5)" error={errors.maxRetries?.message} hint="Next-ranked offers tried after a failure">
              {(id, aria) => <Input id={id} {...aria} inputMode="numeric" {...register('maxRetries')} />}
            </Field>
            <Field label="Timeout per attempt (ms)" error={errors.timeoutMs?.message} hint="1,000 – 300,000">
              {(id, aria) => <Input id={id} {...aria} inputMode="numeric" {...register('timeoutMs')} />}
            </Field>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
