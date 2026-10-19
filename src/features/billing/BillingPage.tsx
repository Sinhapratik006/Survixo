import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreditCard, Info, Lock, Receipt, RefreshCw, Store, Wallet, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DemoBadge,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Skeleton,
  StatCard,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatPercent, formatUsd } from '@/lib/format';
import { useCan } from '@/features/auth/useSession';
import { numberField, useDocumentTitle, useOrgId } from '@/features/dashboard/shared';
import type { Paginated } from '@/types/api';
import { BudgetGuard } from './BudgetGuard';
import type { BillingOverview, BillingTransaction, TransactionType } from './types';

export default function BillingPage() {
  useDocumentTitle('Billing & budgets');
  const orgId = useOrgId();
  const canView = useCan('billing:view');
  const canManage = useCan('billing:manage');
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const checkout = params.get('checkout');

  const overview = useQuery({
    queryKey: ['billing-overview', orgId],
    queryFn: () => api.get<BillingOverview>('/api/billing/overview'),
    enabled: Boolean(orgId) && canView,
  });

  // Support deep links such as /dashboard/billing#budget once the content has rendered.
  useEffect(() => {
    if (!hash || !overview.data) return;
    const el = document.getElementById(hash.slice(1));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [hash, overview.data]);

  const dismissCheckout = () => {
    const next = new URLSearchParams(params);
    next.delete('checkout');
    setParams(next, { replace: true });
  };

  if (!canView) {
    return (
      <>
        <PageHeader title="Billing & budgets" />
        <Card>
          <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="You don't have access to billing" description="Your role cannot view billing in this organization (requires billing:view). Ask an owner, admin or billing manager." />
        </Card>
      </>
    );
  }

  const o = overview.data;

  return (
    <>
      <PageHeader
        title="Billing & budgets"
        description="Prepaid balance, transactions, fees and the Smart Budget Guard that stops overspending before a request is sent."
        badge={o?.billingMode === 'demo' ? <DemoBadge label="Demo billing" title="Demo credit is not real money" /> : undefined}
      />

      {checkout === 'success' && (
        <CheckoutAlert tone="success" title="Payment received by Stripe" onDismiss={dismissCheckout}>
          Your balance updates once Stripe's signed webhook confirms the payment; refresh in a moment.
          <Button variant="outline" size="sm" className="ml-3" onClick={() => overview.refetch()} loading={overview.isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
            Refresh balance
          </Button>
        </CheckoutAlert>
      )}
      {checkout === 'cancelled' && (
        <CheckoutAlert tone="warning" title="Checkout cancelled" onDismiss={dismissCheckout}>
          No payment was taken. You can start a new checkout below whenever you're ready.
        </CheckoutAlert>
      )}

      {overview.error ? (
        <Card className="mb-6">
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} title="Could not load billing overview" />
        </Card>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {!o ? (
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
          ) : (
            <>
              <StatCard
                label="Available balance"
                value={formatUsd(o.balanceUsd)}
                icon={<Wallet className="h-4 w-4" aria-hidden />}
                tone={o.balanceUsd <= 0 ? 'warning' : 'default'}
                badge={o.billingMode === 'demo' && o.demoCreditUsd > 0 ? <DemoBadge label="Includes demo credit" title="Demo credit is not real money" /> : undefined}
                hint="Spendable on new requests"
              />
              <StatCard label="Held for in-flight requests" value={formatUsd(o.heldUsd)} hint="Released or charged when each request settles" />
              <div className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Seller earnings</p>
                  <Store className="h-4 w-4 text-brand-500 dark:text-brand-300" aria-hidden />
                </div>
                <p className={cn('num mt-2 text-2xl font-semibold tracking-tight', o.sellerBalanceUsd > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white')}>{formatUsd(o.sellerBalanceUsd)}</p>
                <Link to="/dashboard/sellers" className="mt-1 inline-block text-xs text-brand-700 hover:underline dark:text-brand-300">
                  Seller overview & payouts →
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <div id="funding" className="scroll-mt-20 lg:col-span-3">
          {!o ? (
            <Card>
              <LoadingBlock className="p-5" />
            </Card>
          ) : o.billingMode === 'demo' ? (
            <DemoCreditCard overview={o} canManage={canManage} />
          ) : (
            <StripeCheckoutCard canManage={canManage} />
          )}
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="How pricing works" description="Fee transparency" />
          <CardBody className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
              <span>
                Buyers pay exactly the seller's listed offer price per token - there is no buyer markup.
              </span>
            </p>
            <p>
              The platform fee of <span className="num font-semibold text-slate-900 dark:text-white">{o ? formatPercent(o.platformFeeBps / 100, o.platformFeeBps % 100 === 0 ? 0 : 2) : '…'}</span> is deducted from
              seller earnings on each settled request.
            </p>
            <p>
              Before dispatch, each request <strong className="font-medium text-slate-900 dark:text-white">holds</strong> its worst-case cost (estimated prompt tokens + max output tokens at the offer price). When it
              completes, the actual cost is charged and the rest of the hold is released. Failed requests are not charged.
            </p>
          </CardBody>
        </Card>
      </div>

      <TransactionsCard />

      <div id="budget" className="scroll-mt-20">
        <BudgetGuard />
      </div>
    </>
  );
}

function CheckoutAlert({ tone, title, children, onDismiss }: { tone: 'success' | 'warning'; title: string; children: ReactNode; onDismiss: () => void }) {
  return (
    <div className="relative mb-6">
      <Alert tone={tone} title={title} className="pr-10">
        <div className="flex flex-wrap items-center gap-y-2">{children}</div>
      </Alert>
      <button type="button" onClick={onDismiss} className="absolute right-2 top-2 rounded-md p-1 opacity-70 hover:opacity-100" aria-label="Dismiss message">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function useInvalidateBilling() {
  const qc = useQueryClient();
  const orgId = useOrgId();
  return () => {
    qc.invalidateQueries({ queryKey: ['billing-overview', orgId] });
    qc.invalidateQueries({ queryKey: ['billing-transactions', orgId] });
    qc.invalidateQueries({ queryKey: ['dashboard-summary', orgId] });
  };
}

function DemoCreditCard({ overview, canManage }: { overview: BillingOverview; canManage: boolean }) {
  const toast = useToast();
  const invalidate = useInvalidateBilling();
  const remaining = Math.max(0, overview.demoCreditCapUsd - overview.demoCreditUsd);
  const maxNow = Math.min(50, remaining);
  const schema = useMemo(
    () =>
      z.object({
        amount: numberField({ label: 'Amount', required: true, min: 0, exclusiveMin: true, max: 50 }).refine((v) => v === '' || Number(v) <= remaining + 1e-9, {
          message: `Only ${formatUsd(remaining)} of demo credit remains`,
        }),
      }),
    [remaining],
  );
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<{ amount: string }>({ resolver: zodResolver(schema), defaultValues: { amount: String(Math.min(25, maxNow) || '') } });

  const credit = useMutation({
    mutationFn: (amountUsd: number) => api.post('/api/billing/demo-credit', { amountUsd }),
    onSuccess: (_d, amount) => {
      toast.success('Demo credit added', `${formatUsd(amount)} of demo credit (not real money).`);
      invalidate();
    },
    onError: (err) => toast.error('Could not add demo credit', errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader title="Add demo credit" description="This server runs in demo billing mode" actions={<DemoBadge label="Not real money" title="Demo credit is not real money" />} />
      <CardBody className="space-y-4">
        <Alert tone="demo" title="Demo credit is not real money">
          It lets you try routing, billing holds and budgets end to end. Card payments are disabled on this server. Demo credit is capped at {formatUsd(overview.demoCreditCapUsd)} per organization.
        </Alert>
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>
              Used <span className="num">{formatUsd(overview.demoCreditUsd)}</span> of <span className="num">{formatUsd(overview.demoCreditCapUsd)}</span>
            </span>
            <span className="num">{formatUsd(remaining)} remaining</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-navy-700" role="progressbar" aria-label="Demo credit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((overview.demoCreditUsd / overview.demoCreditCapUsd) * 100)}>
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, (overview.demoCreditUsd / overview.demoCreditCapUsd) * 100)}%` }} />
          </div>
        </div>
        {!canManage ? (
          <p className="text-sm text-muted">Your role cannot add credit (requires billing:manage).</p>
        ) : remaining <= 0 ? (
          <p className="text-sm text-muted">You have used the full demo credit allowance for this organization.</p>
        ) : (
          <form noValidate onSubmit={handleSubmit((v) => credit.mutate(Number(v.amount)))} className="flex flex-wrap items-end gap-3">
            <Field label="Amount (USD)" error={errors.amount?.message} hint={`Up to ${formatUsd(maxNow)} per top-up`} className="w-44">
              {(id, aria) => <Input id={id} {...aria} inputMode="decimal" {...register('amount')} />}
            </Field>
            <div className="flex gap-1.5 pb-[22px]">
              {[5, 10, 25, 50]
                .filter((n) => n <= maxNow)
                .map((n) => (
                  <Button key={n} variant="secondary" size="sm" onClick={() => setValue('amount', String(n), { shouldValidate: true })}>
                    ${n}
                  </Button>
                ))}
            </div>
            <Button type="submit" loading={credit.isPending} className="mb-[22px]">
              Add demo credit
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

const checkoutSchema = z.object({ amount: numberField({ label: 'Amount', required: true, min: 5, max: 5000 }) });

function StripeCheckoutCard({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<{ amount: string }>({ resolver: zodResolver(checkoutSchema), defaultValues: { amount: '25' } });
  const checkout = useMutation({
    mutationFn: (amountUsd: number) => api.post<{ url: string | null }>('/api/billing/checkout', { amountUsd }),
    onSuccess: (res) => {
      if (!res.url) {
        toast.error('Checkout unavailable', 'Stripe did not return a checkout URL. Please try again.');
        return;
      }
      window.location.assign(res.url);
    },
    onError: (err) => toast.error('Could not start checkout', errorMessage(err)),
  });
  return (
    <Card>
      <CardHeader title="Add credit" description="Prepay with a card via Stripe Checkout" actions={<CreditCard className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden />} />
      <CardBody className="space-y-4">
        <p className="text-sm text-muted">You'll be redirected to Stripe to pay securely. Card details never touch Nexovra servers. Credit is added after Stripe confirms the payment.</p>
        {canManage ? (
          <form noValidate onSubmit={handleSubmit((v) => checkout.mutate(Number(v.amount)))} className="flex flex-wrap items-end gap-3">
            <Field label="Amount (USD)" error={errors.amount?.message} hint="$5 – $5,000" className="w-44">
              {(id, aria) => <Input id={id} {...aria} inputMode="decimal" {...register('amount')} />}
            </Field>
            <div className="flex gap-1.5 pb-[22px]">
              {[10, 25, 100, 500].map((n) => (
                <Button key={n} variant="secondary" size="sm" onClick={() => setValue('amount', String(n), { shouldValidate: true })}>
                  ${n}
                </Button>
              ))}
            </div>
            <Button type="submit" loading={checkout.isPending} className="mb-[22px]" leftIcon={<CreditCard className="h-4 w-4" aria-hidden />}>
              Continue to checkout
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">Your role cannot add credit (requires billing:manage).</p>
        )}
      </CardBody>
    </Card>
  );
}

const TYPE_TONE: Record<TransactionType, 'success' | 'demo' | 'neutral' | 'brand' | 'warning' | 'cyan'> = {
  CREDIT_PURCHASE: 'success',
  DEMO_CREDIT: 'demo',
  USAGE_DEBIT: 'neutral',
  SELLER_EARNING: 'success',
  PAYOUT: 'brand',
  PAYOUT_REVERSAL: 'warning',
  REFUND: 'cyan',
  ADJUSTMENT: 'neutral',
};

function TransactionsCard() {
  const orgId = useOrgId();
  const [account, setAccount] = useState<'BUYER' | 'SELLER'>('BUYER');
  const query = useInfiniteQuery({
    queryKey: ['billing-transactions', orgId, account],
    queryFn: ({ pageParam }) => api.get<Paginated<BillingTransaction>>('/api/billing/transactions', { query: { account, cursor: pageParam, limit: 25 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(orgId),
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Card className="mb-6">
      <CardHeader title="Transactions" description="Immutable ledger of credits, usage debits, earnings and payouts" />
      <div className="px-5 pt-2">
        <Tabs
          tabs={[
            { id: 'BUYER' as const, label: 'Buyer account' },
            { id: 'SELLER' as const, label: 'Seller account' },
          ]}
          value={account}
          onChange={setAccount}
        />
      </div>
      {query.isLoading ? (
        <LoadingBlock rows={5} className="p-5" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load transactions" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Receipt className="h-5 w-5" aria-hidden />} title="No transactions yet" description={account === 'BUYER' ? 'Credits and usage charges will appear here.' : 'Earnings from serving requests and payouts will appear here.'} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Description</Th>
                <Th>Request</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Balance after</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(t.createdAt)}</Td>
                  <Td>
                    <Badge tone={TYPE_TONE[t.type]}>{t.type.replace(/_/g, ' ').toLowerCase()}</Badge>
                  </Td>
                  <Td className="max-w-[320px] truncate" title={t.description}>
                    {t.description}
                  </Td>
                  <Td>
                    {t.requestId ? (
                      <Link to={`/dashboard/usage?request=${encodeURIComponent(t.requestId)}`} className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300" aria-label={`Open request ${t.requestId}`}>
                        {t.requestId.slice(0, 10)}…
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className={cn('num whitespace-nowrap text-right font-medium', t.amountUsd > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300')}>
                    {t.amountUsd > 0 ? '+' : ''}
                    {formatUsd(t.amountUsd)}
                  </Td>
                  <Td className="num text-right">{formatUsd(t.balanceAfterUsd)}</Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
            <span className="num">{rows.length} shown</span>
            {query.hasNextPage ? (
              <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
                Load more
              </Button>
            ) : (
              <span>End of ledger</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
