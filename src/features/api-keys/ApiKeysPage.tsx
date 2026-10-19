import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, KeyRound, Lock, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CodeBlock,
  CopyButton,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatNumber, formatRelative, formatUsd } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { useConfig } from '@/hooks/useConfig';
import { ProgressBar, useDocumentTitle, useOrgId } from '@/features/dashboard/shared';
import type { ApiKeyRow } from '@/features/usage/types';
import { KeyFormModal } from './KeyFormModal';
import { useApiKeys } from './useApiKeys';

interface SecretState {
  secret: string;
  name: string;
  rotated: boolean;
}

export default function ApiKeysPage() {
  useDocumentTitle('API keys');
  const orgId = useOrgId();
  const canView = useCan('keys:view');
  const canManage = useCan('keys:manage');
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const keys = useApiKeys();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKeyRow | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const [rotating, setRotating] = useState<ApiKeyRow | null>(null);
  const [secret, setSecret] = useState<SecretState | null>(null);
  // Stable close handlers (the modal re-runs focus management when onClose changes identity).
  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeRevoke = useCallback(() => setRevoking(null), []);
  const closeRotate = useCallback(() => setRotating(null), []);

  // Deep link from the dashboard quick actions: /dashboard/api-keys?create=1
  useEffect(() => {
    if (params.get('create') === '1') {
      if (canManage) setCreateOpen(true);
      const next = new URLSearchParams(params);
      next.delete('create');
      setParams(next, { replace: true });
    }
  }, [params, setParams, canManage]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['api-keys', orgId] });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post<{ key: ApiKeyRow }>(`/api/api-keys/${id}/revoke`),
    onSuccess: (res) => {
      toast.success('API key revoked', `"${res.key.name}" can no longer authenticate requests.`);
      setRevoking(null);
      invalidate();
    },
    onError: (err) => toast.error('Could not revoke key', errorMessage(err)),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => api.post<{ key: ApiKeyRow; secret: string }>(`/api/api-keys/${id}/rotate`),
    gcTime: 0,
    onSuccess: (res) => {
      setRotating(null);
      setSecret({ secret: res.secret, name: res.key.name, rotated: true });
      invalidate();
    },
    onError: (err) => toast.error('Could not rotate key', errorMessage(err)),
  });
  const resetRotate = rotate.reset;
  // The plaintext secret lives only in this modal: drop it (and the mutation result) on close.
  const closeSecret = useCallback(() => {
    setSecret(null);
    resetRotate();
  }, [resetRotate]);

  if (!canView) {
    return (
      <>
        <PageHeader title="API keys" />
        <Card>
          <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="You don't have access to API keys" description="Your role cannot view keys in this organization (requires keys:view)." />
        </Card>
      </>
    );
  }

  const list = keys.data ?? [];
  const activeCount = list.filter((k) => k.status === 'active').length;

  return (
    <>
      <PageHeader
        title="API keys"
        description="Authenticate calls to the OpenAI-compatible API. Scope keys to projects and cap their spend and request rate."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden />}>
              Create API key
            </Button>
          ) : (
            <Badge>View only</Badge>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card className="min-w-0">
          {keys.isLoading ? (
            <LoadingBlock rows={5} className="p-5" />
          ) : keys.error ? (
            <ErrorState error={keys.error} onRetry={() => keys.refetch()} title="Could not load API keys" />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<KeyRound className="h-5 w-5" aria-hidden />}
              title="No API keys yet"
              description="Create a key to call Nexovra from your code. You'll see the full secret only once."
              action={
                canManage ? (
                  <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden />}>
                    Create your first key
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Key</Th>
                  <Th>Project</Th>
                  <Th>Status</Th>
                  <Th>Spent / limit</Th>
                  <Th className="text-right">RPM</Th>
                  <Th>Expires</Th>
                  <Th>Last used</Th>
                  <Th>Created</Th>
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.map((k) => (
                  <tr key={k.id} className={cn(k.status !== 'active' && 'opacity-70')}>
                    <Td className="font-medium text-slate-900 dark:text-white">
                      {k.name}
                      {k.rotatedFromId && <span className="block text-xs font-normal text-muted">rotated key</span>}
                    </Td>
                    <Td>
                      <span className="whitespace-nowrap font-mono text-xs">{k.maskedKey}</span>
                    </Td>
                    <Td>{k.project ? <span className="whitespace-nowrap">{k.project.name} <span className="text-xs text-muted">· {k.project.environment.toLowerCase()}</span></span> : <span className="text-muted">—</span>}</Td>
                    <Td>
                      <StatusBadge status={k.status} />
                    </Td>
                    <Td className="min-w-[150px]">
                      <span className="num text-xs">
                        {formatUsd(k.spentUsd)}
                        <span className="text-muted"> / {k.spendLimitUsd != null ? formatUsd(k.spendLimitUsd) : 'no limit'}</span>
                      </span>
                      {k.spendLimitUsd != null && <ProgressBar value={k.spentUsd} max={k.spendLimitUsd} label={`${k.name} spend limit used`} className="mt-1" />}
                    </Td>
                    <Td className="num text-right">{k.rpmLimit != null ? formatNumber(k.rpmLimit) : <span className="text-muted">—</span>}</Td>
                    <Td className="whitespace-nowrap">{k.expiresAt ? <span title={formatDateTime(k.expiresAt)}>{formatDate(k.expiresAt)}</span> : <span className="text-muted">Never</span>}</Td>
                    <Td className="whitespace-nowrap">{k.lastUsedAt ? <span title={formatDateTime(k.lastUsedAt)}>{formatRelative(k.lastUsedAt)}</span> : <span className="text-muted">Never</span>}</Td>
                    <Td className="whitespace-nowrap">{formatDate(k.createdAt)}</Td>
                    <Td className="text-right">
                      <KeyActions
                        k={k}
                        canManage={canManage}
                        onEdit={() => setEditing(k)}
                        onRotate={() => setRotating(k)}
                        onRevoke={() => setRevoking(k)}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {list.length > 0 && (
            <p className="px-5 py-3 text-xs text-muted">
              <span className="num">{activeCount}</span> active key{activeCount === 1 ? '' : 's'} · up to 50 active keys per organization
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden /> How keys are stored
              </p>
              <p className="text-muted">
                Nexovra stores only a one-way hash of each key plus its prefix and last four characters. The full secret is shown once at creation or rotation and cannot be recovered - if
                you lose it, rotate the key.
              </p>
              <p className="text-muted">Spend limits are checked before every request using its worst-case cost, so a key cannot overspend its cap.</p>
            </CardBody>
          </Card>
          <UsageSnippet />
        </div>
      </div>

      <KeyFormModal
        open={createOpen}
        mode="create"
        onClose={closeCreate}
        onCreated={(res) => {
          setCreateOpen(false);
          setSecret({ secret: res.secret, name: res.key.name, rotated: false });
        }}
      />
      <KeyFormModal open={Boolean(editing)} mode="edit" initial={editing ?? undefined} onClose={closeEdit} />

      <Modal
        open={Boolean(revoking)}
        onClose={closeRevoke}
        title="Revoke API key?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={revoke.isPending} onClick={() => revoking && revoke.mutate(revoking.id)}>
              Revoke key
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">{revoking?.name}</span> (<span className="font-mono text-xs">{revoking?.maskedKey}</span>) will stop working immediately. Any application using it will receive
          401 errors. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={Boolean(rotating)}
        onClose={closeRotate}
        title="Rotate API key?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRotating(null)}>
              Cancel
            </Button>
            <Button loading={rotate.isPending} onClick={() => rotating && rotate.mutate(rotating.id)} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              Rotate key
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-300">
          A new secret is issued for <span className="font-semibold">{rotating?.name}</span> with the same project, limits and expiry. The current key (
          <span className="font-mono text-xs">{rotating?.maskedKey}</span>) is revoked immediately, so update your applications right after copying the new secret.
        </p>
      </Modal>

      <SecretModal value={secret} onClose={closeSecret} />
    </>
  );
}

function KeyActions({ k, canManage, onEdit, onRotate, onRevoke }: { k: ApiKeyRow; canManage: boolean; onEdit: () => void; onRotate: () => void; onRevoke: () => void }) {
  const editable = canManage && k.status !== 'revoked';
  const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-navy-700 dark:hover:text-white';
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Link to={`/dashboard/usage?apiKeyId=${encodeURIComponent(k.id)}`} className={iconBtn} aria-label={`View usage for ${k.name}`} title="View usage">
        <Activity className="h-4 w-4" aria-hidden />
      </Link>
      {editable && (
        <>
          <button type="button" className={iconBtn} onClick={onEdit} aria-label={`Edit ${k.name}`} title="Edit">
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={iconBtn} onClick={onRotate} aria-label={`Rotate ${k.name}`} title="Rotate (issue a new secret, revoke this one)">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={cn(iconBtn, 'hover:text-red-600 dark:hover:text-red-400')} onClick={onRevoke} aria-label={`Revoke ${k.name}`} title="Revoke">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

/** Shows a freshly issued secret exactly once. The parent clears it from state when this closes. */
function SecretModal({ value, onClose }: { value: SecretState | null; onClose: () => void }) {
  const { data: config } = useConfig();
  const base = config?.apiBaseUrl ?? `${window.location.origin}/v1`;
  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={value?.rotated ? 'Your rotated API key' : 'Your new API key'}
      description={value?.name}
      size="lg"
      footer={<Button onClick={onClose}>I've saved my key</Button>}
    >
      {value && (
        <div className="space-y-4">
          <Alert tone="warning" title="Copy this key now - it will not be shown again">
            Nexovra only stores a hash of the key. Store it in a secret manager or environment variable; never commit it to source control.
            {value.rotated && ' The previous key has been revoked.'}
          </Alert>
          <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/50 p-3 dark:border-navy-600 dark:bg-navy-900">
            <code className="min-w-0 flex-1 break-all font-mono text-sm text-slate-900 dark:text-slate-100">{value.secret}</code>
            <CopyButton value={value.secret} label="Copy key" />
          </div>
          <CodeBlock
            samples={[
              { label: 'bash / zsh', language: 'bash', code: `export NEXOVRA_API_KEY=${value.secret}` },
              { label: 'PowerShell', language: 'powershell', code: `$env:NEXOVRA_API_KEY="${value.secret}"` },
              {
                label: 'curl',
                language: 'bash',
                code: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'`,
              },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}

function UsageSnippet() {
  const { data: config } = useConfig();
  const base = config?.apiBaseUrl ?? `${window.location.origin}/v1`;
  return (
    <CodeBlock
      title="Use with the OpenAI SDK"
      language="ts"
      code={`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.NEXOVRA_API_KEY,
  baseURL: '${base}',
});`}
    />
  );
}
