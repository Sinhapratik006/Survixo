import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Alert, Badge, Button, DemoBadge, ErrorState, Field, Input, KeyValue, LoadingBlock, Modal, Select, StatusBadge, Table, Td, Th, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMs, formatNumber, formatPricePerM, formatRatio, formatUsd } from '@/lib/format';
import type { CatalogModel, ModelsResponse } from '@/types/api';
import { ReliabilityBadge, blended, useEndpoints, useSellerKey } from './shared';
import type { OfferDetail, SellerOffer, ValidationResult } from './types';

function useCatalog() {
  return useQuery({
    queryKey: ['playground', 'catalog-models'],
    queryFn: () => api.get<ModelsResponse>('/api/models', { query: { sort: 'name' } }),
    staleTime: 60_000,
    select: (d) => d.data.filter((m) => m.apiSupported),
  });
}

const priceField = z.string().refine((v) => v.trim() !== '' && Number(v) > 0 && Number(v) <= 1000, 'Greater than 0, at most 1,000');
const intField = (min: number, max: number) => z.string().refine((v) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max, `Whole number ${min.toLocaleString()}–${max.toLocaleString()}`);
const capField = z.string().refine((v) => v.trim() === '' || (Number(v) > 0 && Number(v) <= 1_000_000), 'Leave blank or enter 0–1,000,000');

const limitsShape = {
  inputPrice: priceField,
  outputPrice: priceField,
  maxConcurrency: intField(1, 1000),
  rpmLimit: intField(1, 100_000),
  timeoutMs: intField(1000, 300_000),
  dailyCap: capField,
};

const createSchema = z.object({
  endpointId: z.string().min(1, 'Choose a verified endpoint'),
  upstreamModel: z.string().min(1, 'Choose an upstream model'),
  modelId: z.string().min(1, 'Choose a catalog model'),
  ...limitsShape,
});
type CreateValues = z.infer<typeof createSchema>;

const editSchema = z.object({ upstreamModel: z.string().min(1, 'Choose an upstream model'), ...limitsShape });
type EditValues = z.infer<typeof editSchema>;

function PriceComparison({ model, input, output }: { model: CatalogModel | undefined; input: string; output: string }) {
  if (!model) return null;
  const b = model.baseline;
  const i = Number(input);
  const o = Number(output);
  const valid = i > 0 && o > 0;
  const discount = b && valid ? (1 - blended(i, o) / blended(b.inputPerM, b.outputPerM)) * 100 : null;
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3 text-sm dark:border-navy-600 dark:bg-navy-900/50">
      {b ? (
        <>
          <p className="num flex flex-wrap items-center gap-2">
            Baseline reference: <strong>{formatPricePerM(b.inputPerM)}</strong> in / <strong>{formatPricePerM(b.outputPerM)}</strong> out per 1M
            {b.isDemo && <DemoBadge label="Demo baseline" />}
          </p>
          {discount !== null && (
            <p className={cn('num mt-1', discount > 0 ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}>
              {discount > 0 ? `${discount.toFixed(1)}% below baseline` : `${Math.abs(discount).toFixed(1)}% above baseline`} (blended, 3 input : 1 output tokens)
            </p>
          )}
          {model.bestOffer && (
            <p className="num mt-1 text-xs text-muted">
              Current cheapest offer: {formatPricePerM(model.bestOffer.inputPerM)} / {formatPricePerM(model.bestOffer.outputPerM)}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted">No baseline price recorded for this model, so a discount cannot be computed.</p>
      )}
    </div>
  );
}

function LimitsFields({ form }: { form: ReturnType<typeof useForm<CreateValues>> | ReturnType<typeof useForm<EditValues>> }) {
  const f = form as unknown as ReturnType<typeof useForm<EditValues>>;
  const e = f.formState.errors;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Input price ($ / 1M tokens)" error={e.inputPrice?.message}>
          {(id, aria) => <Input id={id} {...aria} {...f.register('inputPrice')} type="number" min={0} step="0.0001" className="num" />}
        </Field>
        <Field label="Output price ($ / 1M tokens)" error={e.outputPrice?.message}>
          {(id, aria) => <Input id={id} {...aria} {...f.register('outputPrice')} type="number" min={0} step="0.0001" className="num" />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Max concurrency" error={e.maxConcurrency?.message}>
          {(id, aria) => <Input id={id} {...aria} {...f.register('maxConcurrency')} type="number" min={1} className="num" />}
        </Field>
        <Field label="Requests / minute" error={e.rpmLimit?.message}>
          {(id, aria) => <Input id={id} {...aria} {...f.register('rpmLimit')} type="number" min={1} className="num" />}
        </Field>
        <Field label="Timeout (ms)" error={e.timeoutMs?.message}>
          {(id, aria) => <Input id={id} {...aria} {...f.register('timeoutMs')} type="number" min={1000} step={1000} className="num" />}
        </Field>
        <Field label="Daily capacity cap (USD)" error={e.dailyCap?.message} hint="Optional">
          {(id, aria) => <Input id={id} {...aria} {...f.register('dailyCap')} type="number" min={0} step="0.01" className="num" placeholder="No cap" />}
        </Field>
      </div>
    </>
  );
}

export function CreateOfferModal({ onClose }: { onClose: () => void }) {
  const endpoints = useEndpoints();
  const catalog = useCatalog();
  const { base } = useSellerKey();
  const qc = useQueryClient();
  const toast = useToast();
  const verified = (endpoints.data?.data ?? []).filter((e) => e.status === 'VERIFIED');
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { endpointId: '', upstreamModel: '', modelId: '', inputPrice: '', outputPrice: '', maxConcurrency: '8', rpmLimit: '120', timeoutMs: '30000', dailyCap: '' },
  });
  const endpointId = form.watch('endpointId');
  const modelId = form.watch('modelId');
  const endpoint = verified.find((e) => e.id === endpointId);
  const model = catalog.data?.find((m) => m.id === modelId);
  const errors = form.formState.errors;

  const { setValue } = form;
  const onlyEndpointId = verified.length === 1 ? verified[0]!.id : null;
  useEffect(() => {
    if (!endpointId && onlyEndpointId) setValue('endpointId', onlyEndpointId);
  }, [endpointId, onlyEndpointId, setValue]);
  // The upstream model list depends on the endpoint: clear the choice when the endpoint changes.
  const prevEndpoint = useRef(endpointId);
  useEffect(() => {
    if (prevEndpoint.current === endpointId) return;
    prevEndpoint.current = endpointId;
    setValue('upstreamModel', '');
  }, [endpointId, setValue]);

  const create = useMutation({
    mutationFn: (v: CreateValues) =>
      api.post<{ offer: SellerOffer }>('/api/sellers/offers', {
        endpointId: v.endpointId,
        modelId: v.modelId,
        upstreamModel: v.upstreamModel,
        inputPriceUsd: Number(v.inputPrice),
        outputPriceUsd: Number(v.outputPrice),
        maxConcurrency: Number(v.maxConcurrency),
        rpmLimit: Number(v.rpmLimit),
        timeoutMs: Number(v.timeoutMs),
        dailySpendCapUsd: v.dailyCap.trim() ? Number(v.dailyCap) : null,
      }),
    onSuccess: () => {
      toast.success('Offer created as draft', 'Validate it next - offers cannot be activated before validation passes.');
      void qc.invalidateQueries({ queryKey: base });
      onClose();
    },
    onError: (err) => toast.error('Could not create offer', errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={() => !create.isPending && onClose()}
      title="Create offer"
      description="Map a model your endpoint serves to a catalog model and set your price."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="create-offer" loading={create.isPending} disabled={!verified.length}>
            Create draft offer
          </Button>
        </>
      }
    >
      {endpoints.isLoading || catalog.isLoading ? (
        <LoadingBlock />
      ) : endpoints.error || catalog.error ? (
        <ErrorState error={endpoints.error ?? catalog.error} onRetry={() => (endpoints.refetch(), catalog.refetch())} />
      ) : !verified.length ? (
        <Alert tone="warning" title="No verified endpoint">
          Offers can only be created on a verified endpoint. Add an endpoint or re-run verification first.
        </Alert>
      ) : (
        <form id="create-offer" onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Endpoint" error={errors.endpointId?.message} hint="Only verified endpoints are listed.">
              {(id, aria) => (
                <Select id={id} {...aria} {...form.register('endpointId')}>
                  <option value="">Select endpoint…</option>
                  {verified.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.adapter === 'demo' ? ' (demo)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Upstream model" error={errors.upstreamModel?.message} hint="As reported by the endpoint's model list - this makes the mapping verifiable.">
              {(id, aria) => (
                <Select id={id} {...aria} {...form.register('upstreamModel')} disabled={!endpoint}>
                  <option value="">{endpoint ? 'Select upstream model…' : 'Choose an endpoint first'}</option>
                  {endpoint?.discoveredModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Catalog model" error={errors.modelId?.message} hint="What buyers request. Must be the same model as the upstream one.">
              {(id, aria) => (
                <Select id={id} {...aria} {...form.register('modelId')}>
                  <option value="">Select catalog model…</option>
                  {catalog.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider.name})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {endpoint && endpoint.discoveredModelCount > endpoint.discoveredModels.length && (
            <p className="text-xs text-muted">Showing the first {endpoint.discoveredModels.length} of {endpoint.discoveredModelCount} discovered models.</p>
          )}
          <PriceComparison model={model} input={form.watch('inputPrice')} output={form.watch('outputPrice')} />
          <LimitsFields form={form} />
          {endpoint?.adapter === 'demo' && <Alert tone="demo">Offers on demo endpoints are marked as demo and return synthetic responses.</Alert>}
        </form>
      )}
    </Modal>
  );
}

export function EditOfferModal({ offer, onClose }: { offer: SellerOffer; onClose: () => void }) {
  const endpoints = useEndpoints();
  const { base } = useSellerKey();
  const qc = useQueryClient();
  const toast = useToast();
  const endpoint = endpoints.data?.data.find((e) => e.id === offer.endpointId);
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      upstreamModel: offer.upstreamModel,
      inputPrice: String(offer.inputPriceUsd),
      outputPrice: String(offer.outputPriceUsd),
      maxConcurrency: String(offer.maxConcurrency),
      rpmLimit: String(offer.rpmLimit),
      timeoutMs: String(offer.timeoutMs),
      dailyCap: offer.dailySpendCapUsd !== null ? String(offer.dailySpendCapUsd) : '',
    },
  });
  const errors = form.formState.errors;
  const mappingChanged = form.watch('upstreamModel') !== offer.upstreamModel;
  const upstreamOptions = [...new Set([offer.upstreamModel, ...(endpoint?.discoveredModels ?? [])])];

  const save = useMutation({
    mutationFn: (v: EditValues) => {
      const body: Record<string, unknown> = {};
      if (v.upstreamModel !== offer.upstreamModel) body.upstreamModel = v.upstreamModel;
      if (Number(v.inputPrice) !== offer.inputPriceUsd) body.inputPriceUsd = Number(v.inputPrice);
      if (Number(v.outputPrice) !== offer.outputPriceUsd) body.outputPriceUsd = Number(v.outputPrice);
      if (Number(v.maxConcurrency) !== offer.maxConcurrency) body.maxConcurrency = Number(v.maxConcurrency);
      if (Number(v.rpmLimit) !== offer.rpmLimit) body.rpmLimit = Number(v.rpmLimit);
      if (Number(v.timeoutMs) !== offer.timeoutMs) body.timeoutMs = Number(v.timeoutMs);
      const cap = v.dailyCap.trim() ? Number(v.dailyCap) : null;
      if (cap !== offer.dailySpendCapUsd) body.dailySpendCapUsd = cap;
      if (!Object.keys(body).length) return Promise.resolve(null);
      return api.patch<{ offer: SellerOffer }>(`/api/sellers/offers/${offer.id}`, body);
    },
    onSuccess: (r) => {
      if (!r) toast.info('No changes to save');
      else if (!r.offer.validatedAt && offer.validatedAt) toast.success('Offer updated', 'The model mapping changed: validate the offer again before activating it.');
      else toast.success('Offer updated');
      void qc.invalidateQueries({ queryKey: base });
      onClose();
    },
    onError: (err) => toast.error('Could not update offer', errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title={`Edit offer · ${offer.modelName ?? offer.modelId}`}
      description={`On ${offer.endpointName ?? 'endpoint'}. Price changes are recorded in the offer's price history.`}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="edit-offer" loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-offer" onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
        <Field label="Upstream model" error={errors.upstreamModel?.message} hint="Changing the upstream model clears validation and pauses an active offer until it is re-validated.">
          {(id, aria) => (
            <Select id={id} {...aria} {...form.register('upstreamModel')} disabled={endpoints.isLoading}>
              {upstreamOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {mappingChanged && (
          <Alert tone="warning" title="Re-validation required">
            Saving a new upstream model removes the current validation{offer.status === 'ACTIVE' ? ' and pauses this offer' : ''}. Run Validate again, then Activate.
          </Alert>
        )}
        <LimitsFields form={form} />
      </form>
    </Modal>
  );
}

export function ValidationResultModal({ result, onClose }: { result: ValidationResult; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={result.ok ? 'Validation passed' : 'Validation failed'}
      description={`${result.offer.modelName ?? result.offer.modelId} → ${result.offer.upstreamModel}`}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <ol className="space-y-3">
        {result.steps.map((s) => (
          <li key={s.name} className="flex gap-3">
            {s.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <XCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />}
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-900 dark:text-white">
                {s.name}
                <span className="sr-only">{s.ok ? ': passed' : ': failed'}</span>
              </p>
              <p className="break-words text-muted">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <Alert tone={result.ok ? 'success' : 'danger'} className="mt-4">
        {result.ok
          ? result.offer.status === 'ACTIVE'
            ? 'The offer is validated and active.'
            : 'The offer is validated. You can now activate it to receive routed traffic.'
          : (result.offer.validationError ?? 'Fix the failing step and validate again.')}
      </Alert>
      {result.ok && result.offer.verifiedCapabilities.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          Verified capabilities:
          {result.offer.verifiedCapabilities.map((c) => (
            <Badge key={c} tone="success">
              {c}
            </Badge>
          ))}
        </p>
      )}
    </Modal>
  );
}

export function OfferDetailModal({ offerId, onClose }: { offerId: string; onClose: () => void }) {
  const { orgId, base } = useSellerKey();
  const q = useQuery({ queryKey: [...base, 'offer', offerId], queryFn: () => api.get<OfferDetail>(`/api/sellers/offers/${offerId}`), enabled: Boolean(orgId) });
  const d = q.data;
  return (
    <Modal open onClose={onClose} title={d ? `${d.offer.modelName ?? d.offer.modelId}` : 'Offer details'} description={d ? `${d.offer.endpointName ?? ''} · upstream ${d.offer.upstreamModel}` : undefined} size="xl">
      {q.isLoading ? (
        <LoadingBlock rows={6} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : d ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={d.offer.status} />
            <StatusBadge status={d.offer.healthStatus} label={`Health: ${d.offer.healthStatus.toLowerCase()}`} />
            {d.offer.isDemo && <DemoBadge />}
          </div>
          <KeyValue
            className="lg:grid-cols-3"
            items={[
              ['Prices ($/1M in / out)', <span className="num">{formatPricePerM(d.offer.inputPriceUsd)} / {formatPricePerM(d.offer.outputPriceUsd)}</span>],
              ['Validated', d.offer.validatedAt ? formatDateTime(d.offer.validatedAt) : <span className="text-red-600 dark:text-red-400">{d.offer.validationError ?? 'Not validated'}</span>],
              ['Verified capabilities', d.offer.verifiedCapabilities.length ? d.offer.verifiedCapabilities.join(', ') : 'None'],
              ['Limits', <span className="num">{d.offer.maxConcurrency} concurrent · {formatNumber(d.offer.rpmLimit)} rpm · {formatMs(d.offer.timeoutMs)} timeout</span>],
              ['Daily capacity cap', d.offer.dailySpendCapUsd !== null ? formatUsd(d.offer.dailySpendCapUsd) : 'No cap'],
              ['Consecutive failures', <span className="num">{d.offer.consecutiveFailures}</span>],
              ...(d.offer.lastFailureReason ? ([['Last failure', d.offer.lastFailureReason]] as Array<[string, string]>) : []),
              ...(d.offer.unhealthyUntil ? ([['Out of routing until', formatDateTime(d.offer.unhealthyUntil)]] as Array<[string, string]>) : []),
            ]}
          />

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Performance & reliability</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-brand-100 p-3 dark:border-navy-600">
                <p className="text-xs text-muted">Samples</p>
                <p className="num text-lg font-semibold">{formatNumber(d.stats?.samples ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-brand-100 p-3 dark:border-navy-600">
                <p className="text-xs text-muted">Success rate</p>
                <p className="num text-lg font-semibold">{formatRatio(d.stats?.successRate ?? null)}</p>
              </div>
              <div className="rounded-lg border border-brand-100 p-3 dark:border-navy-600">
                <p className="text-xs text-muted">p50 / p95</p>
                <p className="num text-lg font-semibold">
                  {formatMs(d.stats?.p50LatencyMs ?? null)} / {formatMs(d.stats?.p95LatencyMs ?? null)}
                </p>
              </div>
              <div className="rounded-lg border border-brand-100 p-3 dark:border-navy-600">
                <p className="text-xs text-muted">Reliability</p>
                <div className="mt-1">
                  <ReliabilityBadge reliability={d.reliability} />
                </div>
              </div>
            </div>
            {d.reliability && <p className="mt-2 text-sm text-muted">{d.reliability.explanation}</p>}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Health checks (latest 50)</h3>
            {d.healthChecks.length ? (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-brand-50 dark:border-navy-700">
                <Table>
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>Kind</Th>
                      <Th>Result</Th>
                      <Th>Latency</Th>
                      <Th>Error</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.healthChecks.map((c) => (
                      <tr key={c.id}>
                        <Td className="whitespace-nowrap">{formatDateTime(c.checkedAt)}</Td>
                        <Td>
                          <Badge tone={c.kind === 'VALIDATION' ? 'brand' : 'neutral'}>{c.kind}</Badge>
                        </Td>
                        <Td>
                          <StatusBadge status={c.ok ? 'SUCCESS' : 'FAILED'} label={c.ok ? 'OK' : `Failed${c.statusCode ? ` (${c.statusCode})` : ''}`} />
                        </Td>
                        <Td className="num">{formatMs(c.latencyMs)}</Td>
                        <Td className="max-w-[260px] break-words text-xs text-muted">{c.error ?? '-'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted">No health checks recorded yet.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Price history</h3>
            {d.priceHistory.length ? (
              <ul className="divide-y divide-brand-50 rounded-lg border border-brand-50 text-sm dark:divide-navy-700 dark:border-navy-700">
                {d.priceHistory.map((p, i) => (
                  <li key={`${p.at}-${i}`} className="num flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span className="text-muted">{formatDateTime(p.at)}</span>
                    <span>
                      {formatPricePerM(p.inputPriceUsd)} in / {formatPricePerM(p.outputPriceUsd)} out
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No price changes recorded.</p>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}
