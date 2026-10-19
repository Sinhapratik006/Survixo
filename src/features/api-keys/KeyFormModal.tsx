import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, Modal, Select, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { numberField, numStr, toNum, useOrgId, useOrgProjects } from '@/features/dashboard/shared';
import type { ApiKeyRow } from '@/features/usage/types';

/** YYYY-MM-DD (local) for a date input. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Keys expire at the end of the chosen local day. */
const endOfDay = (v: string) => new Date(`${v}T23:59:59`);

function makeSchema(initialExpiry: string) {
  return z.object({
    name: z.string().trim().min(1, 'Name is required').max(60, 'At most 60 characters'),
    projectId: z.string(),
    spendLimitUsd: numberField({ label: 'Spend limit', min: 0, exclusiveMin: true, max: 1_000_000 }),
    rpmLimit: numberField({ label: 'Rate limit', min: 1, max: 10_000, int: true }),
    expiresAt: z
      .string()
      .refine((v) => v === '' || !Number.isNaN(endOfDay(v).getTime()), { message: 'Enter a valid date' })
      .refine((v) => v === '' || v === initialExpiry || endOfDay(v) > new Date(), { message: 'Expiry must be in the future' }),
  });
}
type KeyForm = z.infer<ReturnType<typeof makeSchema>>;

export function KeyFormModal({
  open,
  mode,
  initial,
  onClose,
  onCreated,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: ApiKeyRow;
  onClose: () => void;
  onCreated?: (res: { key: ApiKeyRow; secret: string }) => void;
}) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const toast = useToast();
  const projects = useOrgProjects();
  const initialExpiry = toDateInput(initial?.expiresAt);

  const form = useForm<KeyForm>({
    resolver: zodResolver(makeSchema(initialExpiry)),
    defaultValues: { name: '', projectId: '', spendLimitUsd: '', rpmLimit: '', expiresAt: '' },
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (!open) return;
    reset({
      name: initial?.name ?? '',
      projectId: initial?.project?.id ?? '',
      spendLimitUsd: numStr(initial?.spendLimitUsd),
      rpmLimit: numStr(initial?.rpmLimit),
      expiresAt: toDateInput(initial?.expiresAt),
    });
  }, [open, initial, reset]);

  const save = useMutation({
    mutationFn: async (v: KeyForm) => {
      const body = {
        name: v.name.trim(),
        projectId: v.projectId || null,
        spendLimitUsd: toNum(v.spendLimitUsd),
        rpmLimit: toNum(v.rpmLimit),
        expiresAt: v.expiresAt ? endOfDay(v.expiresAt).toISOString() : null,
      };
      if (mode === 'create') return { kind: 'create' as const, res: await api.post<{ key: ApiKeyRow; secret: string }>('/api/api-keys', body) };
      return { kind: 'edit' as const, res: await api.patch<{ key: ApiKeyRow }>(`/api/api-keys/${initial!.id}`, body) };
    },
    gcTime: 0,
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: ['api-keys', orgId] });
      if (out.kind === 'create') {
        onCreated?.(out.res);
        // Don't keep the plaintext secret in the mutation result; the parent shows it once.
        queueMicrotask(() => save.reset());
      } else {
        toast.success('API key updated');
        onClose();
      }
    },
    onError: (err) => toast.error(mode === 'create' ? 'Could not create key' : 'Could not update key', errorMessage(err)),
  });

  const today = toDateInput(new Date().toISOString());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Create API key' : `Edit "${initial?.name ?? 'key'}"`}
      description={mode === 'create' ? 'All limits are optional and can be changed later.' : 'Changes apply to new requests immediately.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="api-key-form" loading={save.isPending}>
            {mode === 'create' ? 'Create key' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="api-key-form" noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <Field label="Name" error={errors.name?.message} hint="For example: production-backend, staging, ci">
          {(id, aria) => <Input id={id} {...aria} autoComplete="off" maxLength={60} {...register('name')} />}
        </Field>
        <Field
          label="Project (optional)"
          hint={projects.data?.length === 0 ? 'No projects yet - create them under Teams.' : 'Requests use the project budget and routing policy.'}
          error={errors.projectId?.message}
        >
          {(id, aria) => (
            <Select id={id} {...aria} {...register('projectId')} disabled={projects.isLoading}>
              <option value="">No project</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.environment.toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Spend limit (USD, optional)" error={errors.spendLimitUsd?.message} hint="Lifetime cap for this key">
            {(id, aria) => <Input id={id} {...aria} inputMode="decimal" placeholder="No limit" {...register('spendLimitUsd')} />}
          </Field>
          <Field label="Rate limit (requests/min, optional)" error={errors.rpmLimit?.message} hint="1 – 10,000">
            {(id, aria) => <Input id={id} {...aria} inputMode="numeric" placeholder="No limit" {...register('rpmLimit')} />}
          </Field>
        </div>
        <Field label="Expiry date (optional)" error={errors.expiresAt?.message} hint="The key stops working at the end of this day (your local time).">
          {(id, aria) => <Input id={id} {...aria} type="date" min={today} {...register('expiresAt')} />}
        </Field>
      </form>
    </Modal>
  );
}
