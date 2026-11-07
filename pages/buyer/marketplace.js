import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Badge from '../../components/ui/badge';
import { api, formatUsd, formatTokens, formatPct } from '../../lib/api.js';
import { cn } from '../../components/lib/cn.js';
import { Eye, EyeOff, Copy, Check, KeyRound, ShoppingBag } from 'lucide-react';

export default function BuyerMarketplacePage() {
  const router = useRouter();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(100000);
  const [sortBy, setSortBy] = useState('newest');
  const [cursor, setCursor] = useState(null);

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [revealed, setRevealed] = useState({}); // orderId -> full key
  const [busyOrder, setBusyOrder] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [buyBusy, setBuyBusy] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Require a session — signed-out visitors go to /login and come back here,
  // instead of seeing an empty marketplace.
  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    (async () => {
      const goToLogin = () => router.replace('/login?next=/buyer/marketplace');
      try {
        const res = await api.get('/api/auth/me');
        if (cancelled) return;
        // /api/auth/me answers 200 with { user: null } when signed out,
        // so check the payload rather than relying on a thrown error.
        if (res.data && res.data.user) setCheckingAuth(false);
        else goToLogin();
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) goToLogin();
        else setCheckingAuth(false); // transient failure: let them through
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!router.isReady) return;
      if (checkingAuth) return;
      setLoading(true);
      try {
        const res = await api.get('/api/marketplace/listings?search=' + search + '&minPrice=' + minPrice + '&maxPrice=' + maxPrice + '&sort=' + sortBy + (cursor ? '&cursor=' + cursor : ''));
        if (!cancelled) {
          setKeys(res.data.data || []);
          // Handle pagination info if needed
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
  }, [router.isReady, checkingAuth, search, minPrice, maxPrice, sortBy, cursor]);

  // Load the buyer's own purchases (keys are only revealed from here, after payment).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (checkingAuth) return;
      setOrdersLoading(true);
      try {
        const res = await api.get('/api/marketplace/orders');
        if (!cancelled) setOrders(res.data.data || []);
      } catch (e) {
        // Not signed in / no org — just show nothing.
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [checkingAuth]);

  const handleBuy = async (listingId) => {
    setBuyBusy(listingId);
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const res = await api.post('/api/marketplace/checkout', { listingId, idempotencyKey });
      const url = res.data?.checkoutUrl;
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      alert(err.message || 'Could not start checkout');
      setBuyBusy(null);
    }
  };

  // Reveals the full key for a PAID order. The server only returns it when the
  // caller owns the order and its status is PAID.
  const handleReveal = async (orderId) => {
    if (revealed[orderId]) {
      setRevealed((r) => { const n = { ...r }; delete n[orderId]; return n; });
      return;
    }
    setBusyOrder(orderId);
    try {
      const res = await api.get(`/api/marketplace/orders/${orderId}/api-key`);
      setRevealed((r) => ({ ...r, [orderId]: res.data.apiKey }));
    } catch (err) {
      alert(err.message || 'Could not reveal API key');
    } finally {
      setBusyOrder(null);
    }
  };

  const handleCopy = async (orderId, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(orderId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300">Checking your session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-6 mb-8 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Search listings
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title or description..."
                  className="w-full rounded border-slate-300 dark:border-navy-600 px-3 py-2 focus:outline-none focus:border-brand-500 dark:bg-navy-700/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Min Price (USD)
                </label>
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(Number(e.target.value))}
                  placeholder="0"
                  className="w-full rounded border-slate-300 dark:border-navy-600 px-3 py-2 focus:outline-none focus:border-brand-500 dark:bg-navy-700/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Max Price (USD)
                </label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  placeholder="100000"
                  className="w-full rounded border-slate-300 dark:border-navy-600 px-3 py-2 focus:outline-none focus:border-brand-500 dark:bg-navy-700/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Sort by
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full rounded border-slate-300 dark:border-navy-600 px-3 py-2 focus:outline-none focus:border-brand-500 dark:bg-navy-700/50 text-sm"
                >
                  <option value="newest">Newest first</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="popular">Most Popular</option>
                </select>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                API Key Listings
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Browse available API key listings from certified sellers
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full">
                <div className="flex justify-center items-center py-12">
                  <span className="text-slate-600 dark:text-slate-300">Loading keys…</span>
                </div>
              </div>
            ) : keys.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-navy-800/30 flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl text-slate-600 dark:text-slate-300">••••</span>
                </div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">No listings yet</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No API key listings are currently available. Check back later or become a seller to create your own listing.
                </p>
              </div>
            ) : keys.map((key) => (
              <div
                key={key.id}
                className="group hover:bg-slate-50/50 dark:hover:bg-navy-700/30 transition-colors rounded-lg border border-slate-200 dark:border-navy-700 overflow-hidden"
              >
                <div className="p-5 flex flex-col">
                  <h3 className="text-base font-medium text-slate-900 dark:text-white truncate">{key.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-3">{key.description || 'No description'}</p>
                  <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {formatUsd(key.priceUsd)}
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      for {formatUsd(key.creditValueUsd)} of API credits
                    </span>
                    <Badge variant={key.status === 'ACTIVE' ? 'default' : 'secondary'} size="sm">
                      {key.status}
                    </Badge>
                  </div>
                </div>
                <div className="p-3 border-t border-slate-200 dark:border-navy-700">
                  <div className="flex items-center justify-between">
                    <a
                      href="/buyer/marketplace/{key.id}"
                      className="text-sm text-brand-600 dark:text-brand-400 hover:underline transition-colors"
                    >
                      View Details
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBuy(key.id)}
                      disabled={key.status !== 'ACTIVE' || buyBusy === key.id}
                    >
                      {buyBusy === key.id ? 'Redirecting…' : 'Buy Now'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── My Purchases: the only place a full key is ever shown ── */}
          <div className="mt-10 bg-white dark:bg-navy-800/50 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">My Purchases</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              Keys stay hidden until your payment succeeds. Reveal, then copy when you need it.
            </p>

            {ordersLoading ? (
              <div className="py-8 text-center text-sm text-slate-600 dark:text-slate-300">Loading your purchases…</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center">
                <KeyRound className="w-8 h-8 mx-auto text-slate-300 dark:text-navy-600 mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-300">No purchases yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-navy-700">
                {orders.map((o) => {
                  const isPaid = o.status === 'PAID';
                  const key = revealed[o.id];
                  return (
                    <li key={o.id} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{o.listingTitle}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                            {formatUsd(o.amountUsd)} · {o.listingPrefix || '••••'} ·{' '}
                            <span className={isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                              {o.status}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPaid ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReveal(o.id)}
                              disabled={busyOrder === o.id}
                            >
                              {busyOrder === o.id ? 'Revealing…' : key ? (
                                <span className="flex items-center gap-1"><EyeOff className="w-3.5 h-3.5" /> Hide</span>
                              ) : (
                                <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Reveal key</span>
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-600">Available after payment</span>
                          )}
                        </div>
                      </div>

                      {key && (
                        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
                          <code className="flex-1 min-w-0 break-all font-mono text-xs text-emerald-900 dark:text-emerald-200">{key}</code>
                          <button
                            type="button"
                            onClick={() => handleCopy(o.id, key)}
                            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-500/40 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                          >
                            {copiedId === o.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedId === o.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Pagination section would go here */}
          <div className="mt-8 text-center text-sm text-slate-600 dark:text-slate-300">
            {/* Pagination controls */}
          </div>
        </div>
      </div>
    </div>
  );
}