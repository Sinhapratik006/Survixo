import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Power, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, DemoBadge, EmptyState, Field, Input, Modal, QueryState, Select, StatusBadge, Table, Td, Th, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useConfig } from '@/hooks/useConfig';
import { useEndpoints, useSellerKey } from './shared';
import type { SellerEndpoint } from './types';

function isHttpsUrl(v: string) {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

const intIn = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

const createSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60, 'At most 60 characters'),
    adapter: z.string().min(1, 'Choose an adapter'),
    baseUrl: z.string().trim().max(500),
    apiKey: z.string().max(500, 'At most 500 characters'),
    latencyMin: z.string(),
    latencyMax: z.string(),
    failureRate: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.adapter === 'openai_compatible') {
      if (!isHttpsUrl(v.baseUrl)) ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: 'Enter a valid https:// base URL, e.g. https://api.example.com/v1' });
      if (!v.apiKey) ctx.addIssue({ code: 'custom', path: ['apiKey'], message: 'API key is required' });
    }
    if (v.adapter === 'demo') {
      if (!intIn(v.latencyMin, 0, 10_000)) ctx.addIssue({ code: 'custom', path: ['latencyMin'], message: '0–10,000 ms' });
      if (!intIn(v.latencyMax, 0, 20_000)) ctx.addIssue({ code: 'custom', path: ['latencyMax'], message: '0–20,000 ms' });
      else if (intIn(v.latencyMin, 0, 10_000) && Number(v.latencyMax) < Number(v.latencyMin)) ctx.addIssue({ code: 'custom', path: ['latencyMax'], message: 'Must be ≥ min latency' });
      const f = Number(v.failureRate);
      if (v.failureRate.trim() === '' || !Number.isFinite(f) || f < 0 || f > 1) ctx.addIssue({ code: 'custom', path: ['failureRate'], message: 'Between 0 and 1' });
    }
  });
type CreateValues = z.infer<typeof createSchema>;

const editSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60),
    baseUrl: z.string().trim().max(500),
    apiKey: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    if (v.baseUrl && !isHttpsUrl(v.baseUrl)) ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: 'Enter a valid https:// URL' });
  });
type EditValues = z.infer<typeof editSchema>;

function useEndpointToast() {
  const toast = useToast();
  return (e: SellerEndpoint, verb: string) => {
    if (e.status === 'VERIFIED') toast.success(`Endpoint ${verb} and verified`, e.statusMessage ?? undefined);
    else toast.error(`Endpoint ${verb}, but verification failed`, e.statusMessage ?? 'Check the URL and credential, then verify again.');
  };
}

export function EndpointsSection({ canManage }: { canManage: boolean }) {
  const endpoints = useEndpoints();
  const { base } = useSellerKey();
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useEndpointToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SellerEndpoint | null>(null);
  const [disabling, setDisabling] = useState<SellerEndpoint | null>(null);

  const verify = useMutation({
    mutationFn: (id: string) => api.post<{ endpoint: SellerEndpoint }>(`/api/sellers/endpoints/${id}/verify`),
    onSuccess: (r) => {
      notify(r.endpoint, 're-checked');
      void qc.invalidateQueries({ queryKey: base });
    },
    onError: (err) => toast.error('Verification request failed', errorMessage(err)),
  });

  const disable = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sellers/endpoints/${id}`),
    onSuccess: () => {
      toast.success('Endpoint disabled', 'Its offers were archived and the stored credential destroyed.');
      setDisabling(null);
      void qc.invalidateQueries({ queryKey: base });
    },
    onError: (err) => toast.error('Could not disable endpoint', errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader
        title="Endpoints"
        description="Upstream inference servers this organization connects to the marketplace."
        actions={
          canManage && (
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              Add endpoint
            </Button>
          )
        }
      />
      <QueryState
        query={endpoints}
        isEmpty={(d) => !d.data.length}
        empty={
          <EmptyState
            icon={<Server className="h-5 w-5" aria-hidden />}
            title="No endpoints connected"
            description="Connect an OpenAI-compatible endpoint. We verify the credential and discover the models it serves."
            action={canManage && <Button onClick={() => setAdding(true)} leftIcon={<Plus className="h-4 w-4" />}>Add endpoint</Button>}
          />
        }
      >
        {(d) => (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Adapter</Th>
                <Th>Base URL</Th>
                <Th>Status</Th>
                <Th>Models</Th>
                <Th>Credential</Th>
                <Th>Last verified</Th>
                {canManage && (
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </tr>
            </thead>
            <tbody>
              {d.data.map((e) => (
                <tr key={e.id}>
                  <Td className="font-medium text-slate-900 dark:text-white">
                    {e.name}
                    {e.offerCount !== undefined && <p className="text-xs font-normal text-muted">{e.offerCount} offer(s)</p>}
                  </Td>
                  <Td>{e.adapter === 'demo' ? <DemoBadge label="Demo" /> : <Badge>{e.adapter}</Badge>}</Td>
                  <Td className="max-w-[220px] truncate font-mono text-xs" title={e.baseUrl}>
                    {e.baseUrl}
                  </Td>
                  <Td className="max-w-[240px]">
                    <StatusBadge status={e.status} />
                    {e.statusMessage && (
                      <p className={e.status === 'FAILED' ? 'mt-1 text-xs text-red-600 dark:text-red-400' : 'mt-1 text-xs text-muted'} title={e.statusMessage}>
                        {e.statusMessage}
                      </p>
                    )}
                  </Td>
                  <Td className="num">{e.discoveredModelCount}</Td>
                  <Td className="font-mono text-xs">
                    {e.credentialHint ?? <span className="font-sans text-muted">{e.adapter === 'demo' ? 'Not needed' : 'None'}</span>}
                    {e.credentialRotatedAt && <p className="font-sans text-muted">rotated {formatRelative(e.credentialRotatedAt)}</p>}
                  </Td>
                  <Td className="whitespace-nowrap" title={formatDateTime(e.lastVerifiedAt)}>
                    {e.lastVerifiedAt ? formatRelative(e.lastVerifiedAt) : 'Never'}
                  </Td>
                  {canManage && (
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} loading={verify.isPending && verify.variables === e.id} disabled={verify.isPending} onClick={() => verify.mutate(e.id)}>
                          Verify
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Edit endpoint ${e.name}`} onClick={() => setEditing(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Disable endpoint ${e.name}`} onClick={() => setDisabling(e)} className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40">
                          <Power className="h-4 w-4" />
                        </Button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </QueryState>

      {adding && <AddEndpointModal onClose={() => setAdding(false)} />}
      {editing && <EditEndpointModal endpoint={editing} onClose={() => setEditing(null)} />}
      <Modal
        open={Boolean(disabling)}
        onClose={() => !disable.isPending && setDisabling(null)}
        title={`Disable "${disabling?.name ?? ''}"?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDisabling(null)} disabled={disable.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={disable.isPending} onClick={() => disabling && disable.mutate(disabling.id)}>
              Disable endpoint
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <p>This cannot be undone:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>All offers on this endpoint are archived and stop receiving traffic immediately.</li>
            <li>The stored API key is permanently destroyed.</li>
            <li>To sell this capacity again you must add the endpoint and create offers anew.</li>
          </ul>
        </div>
      </Modal>
    </Card>
  );
}

function SecurityNote() {
  return (
    <Alert tone="info" title="How connections are protected">
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Private, loopback, link-local and cloud metadata addresses are blocked (checked on every DNS resolution), and redirects are not followed.</li>
        <li>API keys are encrypted at rest and never shown again - only a short hint is displayed.</li>
      </ul>
    </Alert>
  );
}

function AddEndpointModal({ onClose }: { onClose: () => void }) {
  const { data: config } = useConfig();
  const { base } = useSellerKey();
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useEndpointToast();
  const adapters = (config?.adapters ?? []).filter((a) => a.id !== 'demo' || config?.demoMode);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', adapter: adapters[0]?.id ?? 'openai_compatible', baseUrl: '', apiKey: '', latencyMin: '150', latencyMax: '600', failureRate: '0' },
  });
  const adapter = form.watch('adapter');
  const errors = form.formState.errors;

  const create = useMutation({
    mutationFn: (v: CreateValues) =>
      api.post<{ endpoint: SellerEndpoint }>(
        '/api/sellers/endpoints',
        v.adapter === 'demo'
          ? { name: v.name, adapter: 'demo', demoConfig: { latencyMinMs: Number(v.latencyMin), latencyMaxMs: Number(v.latencyMax), failureRate: Number(v.failureRate) } }
          : { name: v.name, adapter: v.adapter, baseUrl: v.baseUrl, apiKey: v.apiKey },
      ),
    onSuccess: (r) => {
      notify(r.endpoint, 'added');
      void qc.invalidateQueries({ queryKey: base });
      onClose();
    },
    onError: (err) => toast.error('Could not add endpoint', errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={() => !create.isPending && onClose()}
      title="Add endpoint"
      description="We call the endpoint's model list to verify the credential and discover models."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="add-endpoint" loading={create.isPending} leftIcon={<ShieldCheck className="h-4 w-4" />}>
            Add & verify
          </Button>
        </>
      }
    >
      <form id="add-endpoint" onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.message}>
            {(id, aria) => <Input id={id} {...aria} {...form.register('name')} placeholder="Primary GPU cluster" maxLength={60} />}
          </Field>
          <Field label="Adapter" error={errors.adapter?.message}>
            {(id, aria) => (
              <Select id={id} {...aria} {...form.register('adapter')}>
                {adapters.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {adapter === 'demo' ? (
          <>
            <Alert tone="demo" title="Demo adapter">
              Synthetic responses, no real model. Use it to try the seller flow end to end; demo offers are labeled as demo everywhere.
            </Alert>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Min latency (ms)" error={errors.latencyMin?.message}>
                {(id, aria) => <Input id={id} {...aria} {...form.register('latencyMin')} type="number" min={0} max={10000} className="num" />}
              </Field>
              <Field label="Max latency (ms)" error={errors.latencyMax?.message}>
                {(id, aria) => <Input id={id} {...aria} {...form.register('latencyMax')} type="number" min={0} max={20000} className="num" />}
              </Field>
              <Field label="Failure rate (0–1)" error={errors.failureRate?.message}>
                {(id, aria) => <Input id={id} {...aria} {...form.register('failureRate')} type="number" min={0} max={1} step={0.01} className="num" />}
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field label="Base URL" error={errors.baseUrl?.message} hint="The OpenAI-compatible root, usually ending in /v1. HTTPS required.">
              {(id, aria) => <Input id={id} {...aria} {...form.register('baseUrl')} type="url" inputMode="url" placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} />}
            </Field>
            <Field label="API key" error={errors.apiKey?.message} hint="Encrypted at rest. It will never be shown again.">
              {(id, aria) => <Input id={id} {...aria} {...form.register('apiKey')} type="password" autoComplete="new-password" spellCheck={false} />}
            </Field>
            <SecurityNote />
          </>
        )}
      </form>
    </Modal>
  );
}

function EditEndpointModal({ endpoint, onClose }: { endpoint: SellerEndpoint; onClose: () => void }) {
  const { base } = useSellerKey();
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useEndpointToast();
  const isDemo = endpoint.adapter === 'demo';
  const form = useForm<EditValues>({ resolver: zodResolver(editSchema), defaultValues: { name: endpoint.name, baseUrl: '', apiKey: '' } });
  const errors = form.formState.errors;
  const connectionChange = Boolean(form.watch('baseUrl')) || Boolean(form.watch('apiKey'));

  const save = useMutation({
    mutationFn: (v: EditValues) =>
      api.patch<{ endpoint: SellerEndpoint }>(`/api/sellers/endpoints/${endpoint.id}`, {
        ...(v.name !== endpoint.name ? { name: v.name } : {}),
        ...(v.baseUrl ? { baseUrl: v.baseUrl } : {}),
        ...(v.apiKey ? { apiKey: v.apiKey } : {}),
      }),
    onSuccess: (r, v) => {
      if (v.baseUrl || v.apiKey) notify(r.endpoint, 'updated');
      else toast.success('Endpoint renamed');
      void qc.invalidateQueries({ queryKey: base });
      onClose();
    },
    onError: (err) => toast.error('Could not update endpoint', errorMessage(err)),
  });

  const dirty = form.watch('name').trim() !== endpoint.name || connectionChange;

  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title={`Edit ${endpoint.name}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="edit-endpoint" loading={save.isPending} disabled={!dirty}>
            {connectionChange ? 'Save & re-verify' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="edit-endpoint" onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
        <Field label="Name" error={errors.name?.message}>
          {(id, aria) => <Input id={id} {...aria} {...form.register('name')} maxLength={60} />}
        </Field>
        {!isDemo && (
          <>
            <Field label="New base URL (optional)" error={errors.baseUrl?.message} hint={`Current: ${endpoint.baseUrl}`}>
              {(id, aria) => <Input id={id} {...aria} {...form.register('baseUrl')} type="url" placeholder="Leave blank to keep the current URL" spellCheck={false} />}
            </Field>
            <Field label="Rotate API key (optional)" error={errors.apiKey?.message} hint={endpoint.credentialHint ? `Current key: ${endpoint.credentialHint}` : undefined}>
              {(id, aria) => (
                <Input id={id} {...aria} {...form.register('apiKey')} type="password" autoComplete="new-password" placeholder="Leave blank to keep the current key" spellCheck={false} />
              )}
            </Field>
            {connectionChange && (
              <Alert tone="warning" title="Connection change">
                Changing the URL or key pauses every offer on this endpoint and clears its validation. Re-validate and re-activate each offer afterwards.
              </Alert>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <KeyRound className="h-3.5 w-3.5" aria-hidden /> Keys are encrypted at rest and never displayed after saving.
            </p>
          </>
        )}
      </form>
    </Modal>
  );
}
