import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Route, Star, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, CodeBlock, EmptyState, ErrorState, LoadingBlock, Modal, PageHeader, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMs, formatPricePerM } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { useConfig } from '@/hooks/useConfig';
import { useDocumentTitle, useOrgId } from '@/features/dashboard/shared';
import { PolicyFormModal } from './PolicyFormModal';
import { RoutingSimulator } from './Simulator';
import { MODE_INFO, policyToBody, type PoliciesResponse, type RoutingPolicy } from './types';

function limitsSummary(p: RoutingPolicy): string[] {
  const out: string[] = [];
  if (p.maxInputPriceUsd != null) out.push(`input ≤ ${formatPricePerM(p.maxInputPriceUsd)}/1M`);
  if (p.maxOutputPriceUsd != null) out.push(`output ≤ ${formatPricePerM(p.maxOutputPriceUsd)}/1M`);
  if (p.minDiscountPct != null) out.push(`discount ≥ ${p.minDiscountPct}%`);
  if (p.maxLatencyMs != null) out.push(`p50 ≤ ${formatMs(p.maxLatencyMs)}`);
  if (p.minReliability != null) out.push(`reliability ≥ ${p.minReliability}`);
  if (p.minQualityScore != null) out.push(`quality ≥ ${p.minQualityScore}`);
  if (p.allowedProviders.length) out.push(`only ${p.allowedProviders.join(', ')}`);
  if (p.blockedProviders.length) out.push(`blocks ${p.blockedProviders.join(', ')}`);
  if (p.preferredSellers.length) out.push(`prefers ${p.preferredSellers.join(', ')}`);
  if (!p.allowDemoOffers) out.push('no demo offers');
  return out;
}

export default function RoutingPage() {
  useDocumentTitle('Routing');
  const orgId = useOrgId();
  const canView = useCan('routing:view');
  const canManage = useCan('routing:manage');
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RoutingPolicy | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<RoutingPolicy | null>(null);
  // Stable close handlers (the modal re-runs focus management when onClose changes identity).
  const closeForm = useCallback(() => setFormOpen(false), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const query = useQuery({
    queryKey: ['routing-policies', orgId],
    queryFn: () => api.get<PoliciesResponse>('/api/routing/policies'),
    enabled: Boolean(orgId) && canView,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['routing-policies', orgId] });

  const setDefault = useMutation({
    mutationFn: (p: RoutingPolicy) => api.put<{ policy: RoutingPolicy }>(`/api/routing/policies/${p.id}`, policyToBody(p, { isDefault: true })),
    onSuccess: (res) => {
      toast.success('Default policy updated', `"${res.policy.name}" now applies to requests without an explicit or project policy.`);
      invalidate();
    },
    onError: (err) => toast.error('Could not set default', errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/routing/policies/${id}`),
    onSuccess: () => {
      toast.success('Policy deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => toast.error('Could not delete policy', errorMessage(err)),
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  if (!canView) {
    return (
      <>
        <PageHeader title="Routing" />
        <Card>
          <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="You don't have access to routing" description="Your role cannot view routing policies (requires routing:view)." />
        </Card>
      </>
    );
  }

  const policies = query.data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Routing"
        description="Policies decide which seller offers are eligible and how they are ranked. Precedence: request policy_id → project policy → organization default → platform default."
        actions={
          canManage ? (
            <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" aria-hidden />}>
              New policy
            </Button>
          ) : (
            <Badge>View only</Badge>
          )
        }
      />

      <Card className="mb-6">
        <CardHeader title="Routing policies" description={query.data ? `${policies.length} of 25 policies` : undefined} />
        {query.isLoading ? (
          <LoadingBlock rows={4} className="p-5" />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load policies" />
        ) : policies.length === 0 ? (
          <EmptyState
            icon={<Route className="h-5 w-5" aria-hidden />}
            title="No routing policies yet"
            description={
              query.data
                ? `Requests use the platform default: ${MODE_INFO[query.data.platformDefault.mode].label.toLowerCase()}, up to ${query.data.platformDefault.maxRetries} retries, ${formatMs(query.data.platformDefault.timeoutMs)} timeout. Your first policy becomes the default.`
                : undefined
            }
            action={
              canManage ? (
                <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" aria-hidden />}>
                  Create a policy
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-brand-50 dark:divide-navy-700">
            {policies.map((p) => {
              const limits = limitsSummary(p);
              return (
                <li key={p.id} className={cn('flex flex-wrap items-start gap-4 px-5 py-4', p.isDefault && 'bg-cyan-50/40 dark:bg-cyan-950/10')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                      <Badge tone="brand">{MODE_INFO[p.mode].label}</Badge>
                      {p.isDefault && (
                        <Badge tone="cyan">
                          <Star className="h-3 w-3" aria-hidden /> Default
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{MODE_INFO[p.mode].description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {limits.length ? limits.map((l) => <Badge key={l}>{l}</Badge>) : <span className="text-xs text-muted">No extra constraints</span>}
                      <Badge>
                        <span className="num">
                          {p.maxRetries} retr{p.maxRetries === 1 ? 'y' : 'ies'} · {formatMs(p.timeoutMs)} timeout
                        </span>
                      </Badge>
                      {p.mode === 'CUSTOM' && (
                        <Badge tone="cyan">
                          <span className="num">
                            weights P {p.weights.price} · L {p.weights.latency} · Q {p.weights.quality} · R {p.weights.reliability}
                          </span>
                        </Badge>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      {!p.isDefault && (
                        <Button variant="ghost" size="sm" onClick={() => setDefault.mutate(p)} loading={setDefault.isPending && setDefault.variables?.id === p.id} disabled={setDefault.isPending}>
                          Set default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => {
                          setEditing(p);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={p.isDefault ? `${p.name} is the default policy and cannot be deleted` : `Delete ${p.name}`}
                        title={p.isDefault ? 'Set another policy as default before deleting this one' : 'Delete policy'}
                        disabled={p.isDefault}
                        onClick={() => setDeleting(p)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {policies.some((p) => p.isDefault) && canManage && (
          <p className="border-t border-brand-50 px-5 py-3 text-xs text-muted dark:border-navy-700">The default policy can't be deleted - set another policy as default first.</p>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <RoutingSimulator policies={policies} />
        </div>
        <OverrideDocs />
      </div>

      <PolicyFormModal open={formOpen} policy={editing} onClose={closeForm} />

      <Modal
        open={Boolean(deleting)}
        onClose={closeDelete}
        title="Delete routing policy?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete policy
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">{deleting?.name}</span> will be deleted. Projects using it fall back to the organization default, and requests that pass its ID as{' '}
          <code className="font-mono text-xs">policy_id</code> will be rejected.
        </p>
      </Modal>
    </>
  );
}

function OverrideDocs() {
  const { data: config } = useConfig();
  const base = config?.apiBaseUrl ?? `${window.location.origin}/v1`;
  return (
    <Card className="h-fit">
      <CardHeader title="Per-request overrides" description="Change the mode or tighten limits for a single call" />
      <CardBody className="space-y-3">
        <CodeBlock
          samples={[
            {
              label: 'Headers',
              language: 'bash',
              code: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-Nexovra-Routing: balanced" \\
  -H "X-Min-Discount: 30" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hi"}]}'`,
            },
            {
              label: 'Body field',
              language: 'json',
              code: `{
  "model": "auto",
  "messages": [{ "role": "user", "content": "Hi" }],
  "nexovra": {
    "routing_mode": "lowest_cost",
    "policy_id": "<policy id>",
    "min_discount_pct": 30,
    "max_latency_ms": 2000,
    "max_cost_usd": 0.01,
    "preferred_providers": ["openai"],
    "task_id": "nightly-batch-42"
  }
}`,
            },
            {
              label: 'Python',
              language: 'python',
              code: `import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["NEXOVRA_API_KEY"],
                base_url="${base}")

client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hi"}],
    extra_headers={"X-Nexovra-Routing": "quality_first"},
    extra_body={"nexovra": {"min_discount_pct": 20}},
)`,
            },
          ]}
        />
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>
            Modes: <code className="font-mono">lowest_cost</code>, <code className="font-mono">balanced</code>, <code className="font-mono">quality_first</code>,{' '}
            <code className="font-mono">preferred_provider</code>, <code className="font-mono">custom</code>.
          </li>
          <li>Overrides can only tighten limits - the strictest of policy and request wins.</li>
          <li>The body field takes precedence over the X-Nexovra-Routing header.</li>
        </ul>
      </CardBody>
    </Card>
  );
}
