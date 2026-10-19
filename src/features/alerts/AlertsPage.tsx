import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck, Lock } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { useDocumentTitle, useOrgId } from '@/features/dashboard/shared';
import type { NotificationItem } from './types';
import { WebhooksSection } from './Webhooks';

const SEVERITY_TONE: Record<string, 'brand' | 'warning' | 'danger'> = { info: 'brand', warning: 'warning', critical: 'danger' };

export default function AlertsPage() {
  useDocumentTitle('Alerts & webhooks');
  const canView = useCan('usage:view');

  if (!canView) {
    return (
      <>
        <PageHeader title="Alerts & webhooks" />
        <Card>
          <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="You don't have access to alerts" description="Your role cannot view alerts (requires usage:view)." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Alerts & webhooks" description="In-app notifications for budgets, keys, offers and payouts - and signed webhooks to forward the same events to your systems." />
      <AlertCenter />
      <WebhooksSection />
    </>
  );
}

function AlertCenter() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['alerts', orgId, 'list'],
    queryFn: () => api.get<{ data: NotificationItem[]; unread: number }>('/api/alerts'),
    enabled: Boolean(orgId),
    refetchInterval: 60_000,
  });
  // Prefix invalidation also refreshes the unread dot in the top bar.
  const invalidate = () => qc.invalidateQueries({ queryKey: ['alerts'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/alerts/${id}/read`),
    onSuccess: invalidate,
    onError: (err) => toast.error('Could not mark as read', errorMessage(err)),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/api/alerts/read-all'),
    onSuccess: () => {
      toast.success('All alerts marked as read');
      invalidate();
    },
    onError: (err) => toast.error('Could not mark alerts as read', errorMessage(err)),
  });

  const items = query.data?.data ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Bell className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden /> Alert center
            {unread > 0 && <Badge tone="cyan">{unread} unread</Badge>}
          </span>
        }
        description="The latest 100 notifications for this organization"
        actions={
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={unread === 0} leftIcon={<CheckCheck className="h-4 w-4" aria-hidden />}>
            Mark all read
          </Button>
        }
      />
      {query.isLoading ? (
        <LoadingBlock rows={4} className="p-5" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load alerts" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-5 w-5" aria-hidden />}
          title="No alerts yet"
          description="You'll be notified here when a budget threshold is crossed, a key is revoked, an offer fails or a payout changes."
        />
      ) : (
        <ul className="divide-y divide-brand-50 dark:divide-navy-700">
          {items.map((n) => {
            const isUnread = !n.readAt;
            return (
              <li key={n.id} className={cn('flex gap-3 px-5 py-4', isUnread && 'bg-cyan-50/50 dark:bg-cyan-950/20')}>
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', isUnread ? 'bg-cyan-500' : 'bg-transparent')} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[n.severity] ?? 'neutral'}>{n.severity}</Badge>
                    <span className={cn('text-sm', isUnread ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200')}>{n.title}</span>
                    <span className="font-mono text-[11px] text-muted">{n.type}</span>
                    {isUnread && <span className="sr-only">(unread)</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{n.body}</p>
                  <p className="mt-1 text-xs text-muted" title={formatDateTime(n.createdAt)}>
                    {formatRelative(n.createdAt)}
                  </p>
                </div>
                {isUnread && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => markRead.mutate(n.id)}
                    disabled={markRead.isPending && markRead.variables === n.id}
                    aria-label={`Mark "${n.title}" as read`}
                  >
                    Mark read
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
