import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Eye, Pause, Pencil, Play, Plus, ShieldCheck, Store } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, DemoBadge, EmptyState, Modal, PageHeader, QueryState, StatusBadge, Table, Td, Th, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatMs, formatNumber, formatPricePerM, formatRatio, formatRelative, formatUsd, formatDateTime } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { useConfig } from '@/hooks/useConfig';
import { EndpointsSection } from './EndpointsSection';
import { CreateOfferModal, EditOfferModal, OfferDetailModal, ValidationResultModal } from './OfferModals';
import { ReliabilityBadge, useDocumentTitle, useEndpoints, useOffers, useSellerKey } from './shared';
import type { SellerOffer, ValidationResult } from './types';

export default function OffersPage() {
  useDocumentTitle('Endpoints & offers · Nexovra');
  const canView = useCan('seller:view');
  const canManage = useCan('seller:manage');
  const { data: config } = useConfig();

  if (!canView)
    return (
      <div>
        <PageHeader title="Endpoints & offers" />
        <Alert tone="warning">Your role in this organization cannot view seller data (requires seller:view).</Alert>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Endpoints & offers"
        description="Connect upstream endpoints, map their models to catalog models, validate them with live test calls and activate offers for routing."
        badge={config?.demoMode ? <DemoBadge label="Demo adapter available" /> : undefined}
      />
      {!canManage && <Alert>You have read-only access. Managing endpoints and offers requires the seller:manage permission (Owner or Admin).</Alert>}
      <EndpointsSection canManage={canManage} />
      <OffersSection canManage={canManage} />
      <p className="text-xs text-muted">
        Platform fee: {config ? `${(config.platformFeeBps / 100).toFixed(1)}%` : '-'} of each request's cost. Reliability scores need at least {config?.reliability.minSamples ?? 30} observations in{' '}
        {config?.reliability.windowDays ?? 7} days. See your earnings on the <Link to="/dashboard/sellers" className="font-medium text-brand-700 underline dark:text-brand-300">seller overview</Link>.
      </p>
    </div>
  );
}

function OffersSection({ canManage }: { canManage: boolean }) {
  const offers = useOffers();
  const endpoints = useEndpoints();
  const { base } = useSellerKey();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SellerOffer | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<SellerOffer | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: base });

  const validate = useMutation({
    mutationFn: (id: string) => api.post<ValidationResult>(`/api/sellers/offers/${id}/validate`),
    onSuccess: (r) => {
      setValidation(r);
      void invalidate();
    },
    onError: (err) => toast.error('Validation could not run', errorMessage(err)),
  });
  const activate = useMutation({
    mutationFn: (id: string) => api.post(`/api/sellers/offers/${id}/activate`),
    onSuccess: () => {
      toast.success('Offer activated', 'It is now eligible for routing.');
      void invalidate();
    },
    onError: (err) => toast.error('Could not activate offer', errorMessage(err)),
  });
  const pause = useMutation({
    mutationFn: (id: string) => api.post(`/api/sellers/offers/${id}/pause`),
    onSuccess: () => {
      toast.success('Offer paused', 'It no longer receives new requests.');
      void invalidate();
    },
    onError: (err) => toast.error('Could not pause offer', errorMessage(err)),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sellers/offers/${id}`),
    onSuccess: () => {
      toast.success('Offer archived');
      setArchiving(null);
      void invalidate();
    },
    onError: (err) => toast.error('Could not archive offer', errorMessage(err)),
  });

  const hasVerified = (endpoints.data?.data ?? []).some((e) => e.status === 'VERIFIED');
  const busyId = (m: { isPending: boolean; variables?: string }) => (m.isPending ? m.variables : undefined);

  return (
    <Card>
      <CardHeader
        title="Offers"
        description="Each offer sells one catalog model through one endpoint at your price."
        actions={
          canManage && (
            <span title={hasVerified ? undefined : 'Verify an endpoint first'}>
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)} disabled={!hasVerified}>
                Create offer
              </Button>
            </span>
          )
        }
      />
      <QueryState
        query={offers}
        isEmpty={(d) => !d.data.length}
        empty={
          <EmptyState
            icon={<Store className="h-5 w-5" aria-hidden />}
            title="No offers yet"
            description={hasVerified ? 'Create an offer to map a model your endpoint serves to a catalog model.' : 'Connect and verify an endpoint above, then create your first offer.'}
            action={canManage && hasVerified && <Button onClick={() => setCreating(true)} leftIcon={<Plus className="h-4 w-4" />}>Create offer</Button>}
          />
        }
      >
        {(d) => (
          <Table className="[&_table]:min-w-[1200px]">
            <thead>
              <tr>
                <Th>Model</Th>
                <Th>Endpoint · upstream</Th>
                <Th>Price $/1M (in / out)</Th>
                <Th>Status</Th>
                <Th>Validation</Th>
                <Th>Limits</Th>
                <Th>Stats</Th>
                <Th>Reliability</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {d.data.map((o) => {
                const canActivate = Boolean(o.validatedAt) && (o.status === 'DRAFT' || o.status === 'PAUSED');
                const activateReason = !o.validatedAt ? 'Validate the offer successfully before activating it' : o.status === 'SUSPENDED' ? 'Suspended by the platform' : undefined;
                return (
                  <tr key={o.id}>
                    <Td>
                      <p className="font-medium text-slate-900 dark:text-white">{o.modelName ?? o.modelId}</p>
                      {o.isDemo && <DemoBadge label="Demo" className="mt-1" />}
                    </Td>
                    <Td className="max-w-[220px]">
                      <p className="truncate">{o.endpointName ?? '-'}</p>
                      <p className="truncate font-mono text-xs text-muted" title={o.upstreamModel}>
                        {o.upstreamModel}
                      </p>
                    </Td>
                    <Td className="num whitespace-nowrap">
                      {formatPricePerM(o.inputPriceUsd)} / {formatPricePerM(o.outputPriceUsd)}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={o.status} />
                        <StatusBadge status={o.healthStatus} label={o.healthStatus === 'UNKNOWN' ? 'Health unknown' : o.healthStatus === 'HEALTHY' ? 'Healthy' : 'Unhealthy'} />
                      </div>
                    </Td>
                    <Td className="max-w-[220px]">
                      {o.validatedAt ? (
                        <>
                          <p className="text-xs" title={formatDateTime(o.validatedAt)}>
                            Validated {formatRelative(o.validatedAt)}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {o.verifiedCapabilities.map((c) => (
                              <Badge key={c} tone="success">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className={o.validationError ? 'text-xs text-red-600 dark:text-red-400' : 'text-xs text-muted'} title={o.validationError ?? undefined}>
                          {o.validationError ?? 'Not validated yet'}
                        </p>
                      )}
                    </Td>
                    <Td className="num whitespace-nowrap text-xs">
                      <p>{o.maxConcurrency} concurrent</p>
                      <p>{formatNumber(o.rpmLimit)} rpm · {formatMs(o.timeoutMs)}</p>
                      <p className="text-muted">{o.dailySpendCapUsd !== null ? `Cap ${formatUsd(o.dailySpendCapUsd)}/day` : 'No daily cap'}</p>
                    </Td>
                    <Td className="num whitespace-nowrap text-xs">
                      {o.stats && o.stats.samples > 0 ? (
                        <>
                          <p>p50 {formatMs(o.stats.p50LatencyMs)}</p>
                          <p>{formatRatio(o.stats.successRate)} success</p>
                          <p className="text-muted">n={formatNumber(o.stats.samples)}</p>
                        </>
                      ) : (
                        <span className="text-muted">No traffic yet</span>
                      )}
                    </Td>
                    <Td>
                      <ReliabilityBadge reliability={o.reliability} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label={`View details for ${o.modelName ?? o.modelId}`} onClick={() => setDetail(o.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canManage && (
                          <>
                            <Button variant="outline" size="sm" leftIcon={<ShieldCheck className="h-3.5 w-3.5" />} loading={busyId(validate) === o.id} disabled={validate.isPending} onClick={() => validate.mutate(o.id)}>
                              Validate
                            </Button>
                            {o.status === 'ACTIVE' ? (
                              <Button variant="outline" size="sm" leftIcon={<Pause className="h-3.5 w-3.5" />} loading={busyId(pause) === o.id} onClick={() => pause.mutate(o.id)}>
                                Pause
                              </Button>
                            ) : (
                              <span title={activateReason} className="inline-flex">
                                <Button
                                  size="sm"
                                  leftIcon={<Play className="h-3.5 w-3.5" />}
                                  disabled={!canActivate}
                                  loading={busyId(activate) === o.id}
                                  onClick={() => activate.mutate(o.id)}
                                  aria-describedby={activateReason ? `act-${o.id}` : undefined}
                                >
                                  Activate
                                </Button>
                                {activateReason && (
                                  <span id={`act-${o.id}`} className="sr-only">
                                    {activateReason}
                                  </span>
                                )}
                              </span>
                            )}
                            <Button variant="ghost" size="icon" aria-label={`Edit offer for ${o.modelName ?? o.modelId}`} onClick={() => setEditing(o)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Archive offer for ${o.modelName ?? o.modelId}`}
                              onClick={() => setArchiving(o)}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </QueryState>

      {creating && <CreateOfferModal onClose={() => setCreating(false)} />}
      {editing && <EditOfferModal offer={editing} onClose={() => setEditing(null)} />}
      {detail && <OfferDetailModal offerId={detail} onClose={() => setDetail(null)} />}
      {validation && <ValidationResultModal result={validation} onClose={() => setValidation(null)} />}
      <Modal
        open={Boolean(archiving)}
        onClose={() => !archive.isPending && setArchiving(null)}
        title="Archive this offer?"
        description={archiving ? `${archiving.modelName ?? archiving.modelId} on ${archiving.endpointName ?? 'endpoint'}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setArchiving(null)} disabled={archive.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={archive.isPending} onClick={() => archiving && archive.mutate(archiving.id)}>
              Archive offer
            </Button>
          </>
        }
      >
        <p className="text-sm">The offer stops receiving traffic immediately and is removed from this list. Archived offers cannot be edited, validated or re-activated; create a new offer to sell this model again.</p>
      </Modal>
    </Card>
  );
}
