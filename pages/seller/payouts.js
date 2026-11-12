import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Button from '../../components/Button';
import Badge from '../../components/ui/badge';
import Input from '../../components/Input';
import { api, formatUsd } from '../../lib/api.js';
import {
  Wallet,
  ShieldCheck,
  CalendarClock,
  ArrowLeft,
  Info,
  Loader2,
} from 'lucide-react';

const NETWORKS = [
  { value: 'ETHEREUM', label: 'Ethereum (ERC-20)' },
  { value: 'POLYGON', label: 'Polygon' },
  { value: 'ARBITRUM', label: 'Arbitrum One' },
  { value: 'SOLANA', label: 'Solana' },
  { value: 'BITCOIN', label: 'Bitcoin' },
];

const NETWORK_LABELS = Object.fromEntries(NETWORKS.map((n) => [n.value, n.label]));

const PAYOUT_STATUS_VARIANT = {
  REQUESTED: 'secondary',
  PROCESSING: 'default',
  PAID: 'default',
  FAILED: 'destructive',
  CANCELLED: 'outline',
};

const ORDER_STATUS_VARIANT = {
  PAID: 'default',
  PENDING: 'secondary',
  FAILED: 'destructive',
  REFUNDED: 'outline',
  CANCELLED: 'outline',
};

function shortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SellerPayouts() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [user, setUser] = useState(null);
  const [sales, setSales] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [walletAddress, setWalletAddress] = useState('');
  const [walletNetwork, setWalletNetwork] = useState('ETHEREUM');
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletMsg, setWalletMsg] = useState('');
  const [walletError, setWalletError] = useState('');

  const [amount, setAmount] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestMsg, setRequestMsg] = useState('');
  const [requestError, setRequestError] = useState('');

  // Require a session — signed-out visitors go to /login and come back here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/auth/me');
        if (cancelled) return;
        if (res.data && res.data.user) {
          setCheckingAuth(false);
          setUser(res.data.user);
        } else window.location.href = '/login?next=/seller/payouts';
      } catch (e) {
        if (cancelled) return;
        if (e.status === 401 || e.status === 403) {
          window.location.href = '/login?next=/seller/payouts';
        } else {
          setCheckingAuth(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [s, w, so, p] = await Promise.allSettled([
      api.get('/api/marketplace/payout-summary'),
      api.get('/api/marketplace/payout-account'),
      api.get('/api/marketplace/seller-orders'),
      api.get('/api/sellers/payouts'),
    ]);
    if (s.status === 'fulfilled') setSummary(s.value.data);
    else setLoadError(s.reason?.message || 'Could not load your payout summary.');
    if (w.status === 'fulfilled') setWallet(w.value.data.account);
    else if (w.reason?.status !== 401) setWallet(null);
    if (so.status === 'fulfilled') setSales(so.value.data.data || []);
    if (p.status === 'fulfilled') setPayouts(p.value.data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (checkingAuth) return;
    loadAll();
  }, [checkingAuth, loadAll]);

  const saveWallet = async (e) => {
    e.preventDefault();
    setWalletSaving(true);
    setWalletMsg('');
    setWalletError('');
    try {
      const res = await api.post('/api/marketplace/payout-account', {
        walletAddress: walletAddress.trim(),
        network: walletNetwork,
      });
      setWallet(res.data.account);
      setWalletAddress('');
      setWalletMsg('Wallet saved. Our ops team reviews and verifies payout wallets before funds are released — you will only be paid to a verified wallet.');
      await loadAll();
    } catch (err) {
      setWalletError(err.message || 'Could not save this wallet.');
    } finally {
      setWalletSaving(false);
    }
  };

  const amountNum = Number(amount);
  const minPayout = summary?.minPayoutUsd ?? 25;
  const available = summary?.availableBalanceUsd ?? 0;
  const canRequest =
    wallet?.isVerified &&
    summary &&
    Number.isFinite(amountNum) &&
    amountNum >= minPayout &&
    amountNum <= available;

  const requestPayout = async (e) => {
    e.preventDefault();
    setRequesting(true);
    setRequestMsg('');
    setRequestError('');
    try {
      const res = await api.post('/api/sellers/payouts', { amountUsd: amountNum });
      setRequestMsg(
        `Payout of ${formatUsd(res.data?.payout?.amountUsd ?? amountNum)} requested. The amount is reserved from your balance and settles in the Friday batch.`,
      );
      setAmount('');
      await loadAll();
    } catch (err) {
      setRequestError(
        err.status === 403
          ? 'Only workspace owners and admins can request payouts.'
          : err.message || 'Could not request this payout.',
      );
    } finally {
      setRequesting(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Checking your session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* ───────── Header ───────── */}
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <Link
                  href="/seller/dashboard"
                  className="p-2 rounded-lg border border-slate-200 dark:border-navy-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-navy-600 transition-colors"
                  aria-label="Back to seller dashboard"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Wallet className="w-6 h-6 text-brand-600 dark:text-brand-400" />
                    Payouts
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Your 60% cut from API key sales, paid weekly (Fridays, UTC).
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => (window.location.href = '/seller/dashboard')}>
                My listings
              </Button>
            </div>
          </div>

          {loadError && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300">
              {loadError}
            </div>
          )}

          {/* ───────── Balance stats ───────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              {
                label: 'Available balance',
                value: loading ? '…' : formatUsd(available),
                hint: 'Ready to request',
                accent: 'text-brand-600 dark:text-brand-400',
              },
              {
                label: 'Pending payouts',
                value: loading ? '…' : formatUsd(summary?.pendingPayoutUsd ?? 0),
                hint: summary?.pendingPayoutCount ? `${summary.pendingPayoutCount} request${summary.pendingPayoutCount === 1 ? '' : 's'} queued` : 'None queued',
                accent: 'text-amber-600 dark:text-amber-400',
              },
              {
                label: 'Lifetime earnings',
                value: loading ? '…' : formatUsd(summary?.lifetimeEarningsUsd ?? 0),
                hint: summary ? `${summary.paidSalesCount} sale${summary.paidSalesCount === 1 ? '' : 's'} paid` : '—',
                accent: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                label: 'Last 7 days',
                value: loading ? '…' : formatUsd(summary?.last7DaysEarningsUsd ?? 0),
                hint: summary ? `${summary.last7DaysSalesCount} paid this week` : '—',
                accent: 'text-slate-900 dark:text-white',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white dark:bg-navy-800/50 rounded-xl p-4 sm:p-5 shadow-sm border border-slate-200 dark:border-navy-700"
              >
                <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  {stat.label}
                </div>
                <div className={`text-xl sm:text-2xl font-bold tabular-nums ${stat.accent}`}>{stat.value}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-1">{stat.hint}</div>
              </div>
            ))}
          </div>

          {/* ───────── How payouts work ───────── */}
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-navy-700">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">How payouts work</h3>
            </div>
            <ol className="grid sm:grid-cols-3 gap-4 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex gap-2">
                <span className="flex-none w-5 h-5 rounded-full bg-brand-100 dark:bg-navy-700 text-brand-700 dark:text-brand-300 text-[11px] font-bold flex items-center justify-center">1</span>
                <span>A buyer purchases your listing. Your 60% cut is credited to your seller balance as soon as payment is confirmed.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-none w-5 h-5 rounded-full bg-brand-100 dark:bg-navy-700 text-brand-700 dark:text-brand-300 text-[11px] font-bold flex items-center justify-center">2</span>
                <span>Connect a payout wallet below. Our ops team verifies the address before it is allowed to receive funds.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-none w-5 h-5 rounded-full bg-brand-100 dark:bg-navy-700 text-brand-700 dark:text-brand-300 text-[11px] font-bold flex items-center justify-center">3</span>
                <span>Request a payout any time. Payments are made in weekly batches every Friday (minimum {formatUsd(minPayout)}); the amount is reserved immediately.</span>
              </li>
            </ol>
            <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300">
              <Info className="w-4 h-4 flex-none mt-0.5" />
              <p>
                {summary?.nextPayoutDate ? (
                  <>Next settlement: <strong>{shortDate(summary.nextPayoutDate)} ({summary.payoutDay ?? 'Friday'})</strong>. </>
                ) : null}
                Until a payout provider is configured on this deployment, the weekly batch is processed manually by the ApiTradeX ops team — payout requests are recorded, reserved, and do not disappear from your balance. No on-chain transfer is initiated automatically yet.
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* ───────── Crypto wallet ───────── */}
            <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-navy-700">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Payout wallet</h3>
                {wallet && (
                  wallet.isVerified ? (
                    <Badge variant="default" className="ml-auto flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-auto">Pending verification</Badge>
                  )
                ) &&
                user && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <div>ID: {user.id}</div>
                    {user.name && <div>Name: {user.name}</div>}
                    {user.email && <div>Email: {user.email}</div>}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Where your seller earnings are paid. Payouts are only released to verified wallets.
              </p>

              {wallet ? (
                <div className="rounded-xl border border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-900/40 p-4 mb-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Current wallet</div>
                  <div className="mt-1 font-mono text-sm text-slate-900 dark:text-white break-all">{wallet.walletAddress}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Network: {NETWORK_LABELS[wallet.network] ?? wallet.network}
                    {wallet.isVerified ? '' : ' · verification pending — funds are not released until ops approves this address'}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-navy-600 p-4 mb-4 text-sm text-slate-500 dark:text-slate-400">
                  No wallet connected yet. Add one below — without a verified wallet you cannot request a payout.
                </div>
              )}

              <form onSubmit={saveWallet} className="space-y-4">
                <div>
                  <label htmlFor="walletAddress" className="block text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-tighter mb-1.5">
                    {wallet ? 'Replace wallet address' : 'Wallet address'}
                  </label>
                  <input
                    id="walletAddress"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder={walletNetwork === 'BITCOIN' ? 'bc1… or 1… / 3…' : walletNetwork === 'SOLANA' ? 'Solana address (base58)' : '0x…'}
                    className="block w-full rounded-xl border px-4 py-2.5 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-navy-400 bg-white dark:bg-navy-900/40 border-slate-200 dark:border-navy-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label htmlFor="walletNetwork" className="block text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-tighter mb-1.5">
                    Network
                  </label>
                  <select
                    id="walletNetwork"
                    value={walletNetwork}
                    onChange={(e) => setWalletNetwork(e.target.value)}
                    className="block w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 dark:text-white bg-white dark:bg-navy-900/40 border-slate-200 dark:border-navy-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:border-brand-500"
                  >
                    {NETWORKS.map((n) => (
                      <option key={n.value} value={n.value}>{n.label}</option>
                    ))}
                  </select>
                </div>
                {walletError && <p className="text-xs text-rose-600 dark:text-rose-400">{walletError}</p>}
                {walletMsg && <p className="text-xs text-emerald-700 dark:text-emerald-400">{walletMsg}</p>}
                <Button type="submit" variant="primary" disabled={walletSaving || !walletAddress.trim()}>
                  {walletSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save wallet'}
                </Button>
              </form>
            </div>

            {/* ───────── Request payout + history ───────── */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-navy-700">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Request payout</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Minimum {formatUsd(minPayout)} · any amount up to your available balance · settled weekly
                </p>
                <form onSubmit={requestPayout} className="space-y-4">
                  <Input
                    label="Amount (USD)"
                    type="number"
                    min={minPayout}
                    max={available}
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`${minPayout.toFixed(2)}`}
                    helper={`Available: ${formatUsd(available)}`}
                  />
                  {!wallet?.isVerified && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {wallet
                        ? 'Your wallet is pending verification — payouts are released only after ops approves it.'
                        : 'Connect and verify a payout wallet before requesting a payout.'}
                    </p>
                  )}
                  {requestError && <p className="text-xs text-rose-600 dark:text-rose-400">{requestError}</p>}
                  {requestMsg && <p className="text-xs text-emerald-700 dark:text-emerald-400">{requestMsg}</p>}
                  <Button type="submit" variant="primary" disabled={!canRequest || requesting}>
                    {requesting ? <><Loader2 className="w-4 h-4 animate-spin" /> Requesting…</> : `Request ${amountNum >= minPayout ? formatUsd(amountNum) : 'payout'}`}
                  </Button>
                </form>
              </div>

              <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-navy-700">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3">Payout history</h3>
                {payouts.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">No payouts yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-navy-700">
                    {payouts.slice(0, 8).map((p) => {
                      const requestingUser = user?.id === p.requestedById ? user : null;
                      return (
                        <li key={p.id} className="py-3 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">{formatUsd(p.amountUsd)}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-500">
                              {shortDate(p.createdAt)}{p.destination ? ` · ${p.destination}` : ''}
                              {requestingUser && <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-300">By: {requestingUser.name || ''} ({requestingUser.email ? `(${requestingUser.email})` : '' | `ID: ${requestingUser.id}`)}</div>}
                            </div>
                          </div>
                          <Badge variant={PAYOUT_STATUS_VARIANT[p.status] ?? 'outline'}>{p.status}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* ───────── Sales of your listings ───────── */}
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-navy-700">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Sales of your listings</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Every buyer purchase and your 60% cut.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = '/marketplace')}>
                View marketplace
              </Button>
            </div>
            {sales.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No sales yet — publish a listing and your earnings will show up here.</p>
                <Button variant="outline" onClick={() => (window.location.href = '/seller/create')}>Create a listing</Button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-navy-700">
                      <th className="py-2 px-2 font-medium">Listing</th>
                      <th className="py-2 px-2 font-medium">Date</th>
                      <th className="py-2 px-2 font-medium text-right">Buyer paid</th>
                      <th className="py-2 px-2 font-medium text-right">Your cut (60%)</th>
                      <th className="py-2 px-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-navy-800">
                    {sales.map((s) => (
                      <tr key={s.id}>
                        <td className="py-3 px-2">
                          <div className="font-medium text-slate-900 dark:text-white max-w-[240px] truncate">{s.listingTitle}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-500">Buyer: {s.buyerOrg}</div>
                        </td>
                        <td className="py-3 px-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">{shortDate(s.createdAt)}</td>
                        <td className="py-3 px-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatUsd(Number(s.amountUsd))}</td>
                        <td className="py-3 px-2 text-right tabular-nums font-semibold text-slate-900 dark:text-white">{formatUsd(Number(s.sellerEarningUsd))}</td>
                        <td className="py-3 px-2 text-right">
                          <Badge variant={ORDER_STATUS_VARIANT[s.status] ?? 'outline'}>{s.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
