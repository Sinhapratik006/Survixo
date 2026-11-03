import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Menu, Sun, Moon, Eye, EyeOff, ShieldCheck, Info,
  ArrowLeft, Pause, Play, Trash2, KeyRound, Check, Loader2,
} from 'lucide-react';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Badge from '../../../components/ui/badge';
import { api, formatUsd } from '../../../lib/api.js';

const PLATFORM_FEE_RATE = 0.2; // 20% platform commission

export default function SellerListingManagePage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';

  const [dark, setDark] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [listing, setListing] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // edit form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [models, setModels] = useState('');
  const [maxBuyers, setMaxBuyers] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [editError, setEditError] = useState('');

  // rotate key
  const [newKey, setNewKey] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateMsg, setRotateMsg] = useState('');

  // status actions
  const [statusBusy, setStatusBusy] = useState('');
  const [statusError, setStatusError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState('');

  useEffect(() => {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('nexovra-theme') : null;
    const storedDark = storedTheme ? storedTheme : (prefersDark ? 'dark' : 'light');
    setDark(storedDark === 'dark');
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', storedDark === 'dark');
    }
  }, []);

  // Require a session (same guard as /seller/create and /seller/dashboard).
  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    (async () => {
      const goToLogin = () =>
        router.replace(`/login?next=${encodeURIComponent(`/seller/listing/${id || ''}`)}`);
      try {
        const res = await api.get('/api/auth/me');
        if (cancelled) return;
        // /api/auth/me answers 200 with { user: null } when signed out.
        if (res.data && res.data.user) setCheckingAuth(false);
        else goToLogin();
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) goToLogin();
        else setCheckingAuth(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const [detail, sellerOrders] = await Promise.all([
        api.get(`/api/marketplace/my-listings/${id}`),
        api.get('/api/marketplace/seller-orders').catch(() => ({ data: { data: [] } })),
      ]);
      const l = detail.data.listing;
      setListing(l);
      setTitle(l.title || '');
      setDescription(l.description || '');
      setPrice(String(l.priceUsd ?? ''));
      setModels(Array.isArray(l.models) ? l.models.join(', ') : '');
      setMaxBuyers(l.maxBuyers != null ? String(l.maxBuyers) : '');
      setOrders((sellerOrders.data?.data || []).filter((o) => o.listingId === l.id));
    } catch (e) {
      setLoadError(e.message || 'Failed to load this listing');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (checkingAuth || !id) return;
    load();
  }, [checkingAuth, id, load]);

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('nexovra-theme', next ? 'dark' : 'light');
      }
      return next;
    });
  };

  const priceNum = Number(price) || 0;
  const feeUsd = priceNum * PLATFORM_FEE_RATE;
  const netUsd = priceNum - feeUsd;

  const handleSave = async (e) => {
    e.preventDefault();
    setEditError('');
    setSaveMsg('');
    if (priceNum < 0.01) {
      setEditError('Price must be at least $0.01.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/marketplace/listings/${id}`, {
        title: title.trim(),
        description: description.trim(),
        priceUsd: priceNum,
        models: models.split(',').map((m) => m.trim()).filter(Boolean),
        maxBuyers: maxBuyers.trim() === '' ? null : Number(maxBuyers),
      });
      setSaveMsg('Saved.');
      await load();
    } catch (err) {
      setEditError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  const handleRotate = async (e) => {
    e.preventDefault();
    setRotateMsg('');
    if (!newKey.trim()) return;
    setRotating(true);
    try {
      await api.patch(`/api/marketplace/listings/${id}`, { apiKey: newKey.trim() });
      setNewKey('');
      setRotateMsg('API key updated. Buyers who purchase from now on receive the new key.');
      await load();
    } catch (err) {
      setRotateMsg(err.message || 'Failed to update API key');
    } finally {
      setRotating(false);
      setTimeout(() => setRotateMsg(''), 5000);
    }
  };

  const setStatus = async (status) => {
    setStatusError('');
    setStatusBusy(status);
    try {
      await api.patch(`/api/marketplace/listings/${id}`, { status });
      await load();
    } catch (err) {
      setStatusError(err.message || 'Failed to update status');
    } finally {
      setStatusBusy('');
    }
  };

  const handleDelete = async () => {
    setStatusError('');
    setDeleteInfo('');
    setStatusBusy('DELETE');
    try {
      const res = await api.delete(`/api/marketplace/listings/${id}`);
      const d = res.data || {};
      setConfirmDelete(false);
      if (d.deleted) {
        // Removed for real — nothing referenced it.
        window.location.href = '/seller/dashboard';
        return;
      }
      // Orders exist: archived instead so buyers keep their keys and payout
      // records survive. It stays reachable here for its order history.
      setDeleteInfo(
        `This listing has ${d.orderCount} order${d.orderCount === 1 ? '' : 's'}, so it was archived instead of deleted. Buyers keep their purchased keys and your payout records are preserved.`,
      );
      await load();
    } catch (err) {
      setStatusError(err.message || 'Failed to delete listing');
      setConfirmDelete(false);
    } finally {
      setStatusBusy('');
    }
  };

  const labelCls = 'block text-sm font-medium text-slate-600 dark:text-slate-400 uppercase tracking-tighter mb-2';

  const nav = (
    <nav className="sticky top-0 z-50 border-b border-slate-200/60 dark:border-navy-700/30 bg-white/80 dark:bg-navy-950/80 backdrop-blur-md">
      <div className="container-page">
        <div className="flex items-center justify-between h-16">
          <a href="/seller/dashboard" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30 relative overflow-hidden">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">Surplus Intelligence</span>
          </a>
          <div className="hidden md:flex items-center gap-6">
            <a href="/seller/dashboard" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              Dashboard
            </a>
            <a href="/seller/create" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              Create
            </a>
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="w-4 h-4 mx-auto" /> : <Moon className="w-4 h-4 mx-auto" />}
            </button>
          </div>
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="w-4 h-4 mx-auto" /> : <Moon className="w-4 h-4 mx-auto" />}
            </button>
            <a href="/seller/dashboard" className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors flex items-center justify-center" aria-label="Back to dashboard">
              <Menu className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </nav>
  );

  const spinner = (
    <div className="min-h-screen bg-canvas dark:bg-navy-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Checking your session…</p>
      </div>
    </div>
  );

  if (checkingAuth) return spinner;

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950">
        {nav}
        <div className="py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading listing…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950">
        {nav}
        <div className="py-16 max-w-lg mx-auto px-4 text-center">
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Listing not available</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{loadError}</p>
            <Button onClick={() => { window.location.href = '/seller/dashboard'; }}>
              Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isArchived = listing.status === 'ARCHIVED';
  const isPaused = listing.status === 'PAUSED';

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      {nav}

      <main className="py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <a
            href="/seller/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </a>

          {/* Header */}
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-6 mb-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">
                    {listing.title}
                  </h1>
                  <Badge variant={isArchived ? 'secondary' : 'default'} size="sm">
                    {listing.status}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {listing.description || 'No description'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isArchived && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={statusBusy !== ''}
                    onClick={() => setStatus(isPaused ? 'ACTIVE' : 'PAUSED')}
                  >
                    {statusBusy === (isPaused ? 'ACTIVE' : 'PAUSED') ? (
                      'Working…'
                    ) : isPaused ? (
                      <><Play className="w-3.5 h-3.5" /> Resume</>
                    ) : (
                      <><Pause className="w-3.5 h-3.5" /> Pause</>
                    )}
                  </Button>
                )}
                {!isArchived && !confirmDelete && (
                  <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete listing
                  </Button>
                )}
                {confirmDelete && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={statusBusy !== ''}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={statusBusy !== ''}
                      onClick={handleDelete}
                    >
                      {statusBusy === 'DELETE' ? 'Deleting…' : 'Yes, delete it'}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {confirmDelete && (
              <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/10 p-4 text-sm text-rose-800 dark:text-rose-300">
                <p className="font-semibold mb-1">Delete “{listing.title}”?</p>
                <p>
                  If no one has bought it, it is removed permanently and disappears from your
                  dashboard. If it already has orders, it will be archived instead — a listing with
                  sales can’t be destroyed because buyers still hold their purchased keys.
                </p>
              </div>
            )}

            {deleteInfo && (
              <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4 text-sm text-amber-800 dark:text-amber-300">
                {deleteInfo}
              </div>
            )}

            {statusError && (
              <div className="mt-4 p-3 rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/10 text-sm text-rose-700 dark:text-rose-400">
                {statusError}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 shadow-sm">
              <p className="text-xs uppercase tracking-tighter text-slate-500 dark:text-slate-400 mb-1">Price</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white">
                ${formatUsd(listing.priceUsd)}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">per 1M tokens</p>
            </div>
            <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 shadow-sm">
              <p className="text-xs uppercase tracking-tighter text-slate-500 dark:text-slate-400 mb-1">Buyers</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white">
                {listing.buyerCount}
                {listing.maxBuyers != null && (
                  <span className="text-sm font-normal text-slate-400"> / {listing.maxBuyers}</span>
                )}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {listing.maxBuyers == null ? 'unlimited' : listing.isSoldOut ? 'sold out' : 'available'}
              </p>
            </div>
            <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 shadow-sm">
              <p className="text-xs uppercase tracking-tighter text-slate-500 dark:text-slate-400 mb-1">Orders</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white">{listing.orderCount}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">all time</p>
            </div>
            <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 shadow-sm">
              <p className="text-xs uppercase tracking-tighter text-slate-500 dark:text-slate-400 mb-1">Your key</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white font-mono">
                {listing.apiKeyPrefix || '••••'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">stored encrypted</p>
            </div>
          </div>

          {/* Models */}
          {Array.isArray(listing.models) && listing.models.length > 0 && (
            <div className="bg-white dark:bg-navy-800/50 rounded-xl p-5 mb-6 shadow-sm">
              <p className="text-xs uppercase tracking-tighter text-slate-500 dark:text-slate-400 mb-3">Models</p>
              <div className="flex flex-wrap gap-2">
                {listing.models.map((m) => (
                  <span
                    key={m}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-700 text-xs font-mono text-slate-700 dark:text-slate-300"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Edit */}
            <div className="bg-white dark:bg-navy-800/50 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Edit listing</h2>

              {editError && (
                <div className="mb-4 p-3 rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/10 text-sm text-rose-700 dark:text-rose-400">
                  {editError}
                </div>
              )}
              {saveMsg && (
                <div className="mb-4 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-900/10 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4" /> {saveMsg}
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className={labelCls}>Listing Name</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
                </div>
                <div>
                  <label className={labelCls}>Description</label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
                </div>
                <div>
                  <label className={labelCls}>Price (USD per 1M tokens)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                  {priceNum > 0 && (
                    <div className="mt-2 rounded-lg bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-700 p-3 text-xs">
                      <div className="flex justify-between text-slate-600 dark:text-slate-300">
                        <span>List price</span>
                        <span className="font-medium">${priceNum.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Info className="w-3 h-3" /> Platform fee (20%)
                        </span>
                        <span>−${feeUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 mt-1 pt-1 border-t border-slate-200 dark:border-navy-700">
                        <span className="font-medium">You earn</span>
                        <span className="font-medium">${netUsd.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Models</label>
                  <Input
                    placeholder="e.g. gpt-4, gpt-4-turbo"
                    value={models}
                    onChange={(e) => setModels(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Comma-separated model names</p>
                </div>
                <div>
                  <label className={labelCls}>Max buyers (optional)</label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Leave empty for unlimited"
                    value={maxBuyers}
                    onChange={(e) => setMaxBuyers(e.target.value)}
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </form>
            </div>

            <div className="space-y-6">
              {/* Rotate key */}
              <div className="bg-white dark:bg-navy-800/50 rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400" /> API key
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Current key ends in{' '}
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {listing.apiKeyPrefix || '••••'}
                  </span>
                  . The full value is never shown again — replace it only if you need to rotate.
                </p>

                {rotateMsg && (
                  <div className="mb-4 p-3 rounded-xl border border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-900/60 text-sm text-slate-700 dark:text-slate-300">
                    {rotateMsg}
                  </div>
                )}

                <form onSubmit={handleRotate} className="space-y-4">
                  <div className="relative">
                    <input
                      type={showNewKey ? 'text' : 'password'}
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="sk-... (new key)"
                      maxLength={2000}
                      autoComplete="off"
                      spellCheck={false}
                      className="block w-full rounded-xl border px-4 py-2.5 pr-11 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-navy-400 bg-white dark:bg-navy-900/40 border-slate-200 dark:border-navy-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:border-brand-500 transition-all duration-200 hover:border-slate-300 dark:hover:border-navy-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewKey((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showNewKey ? 'Hide API key' : 'Show API key'}
                      tabIndex={-1}
                    >
                      {showNewKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex gap-2 rounded-lg border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 p-3">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                    <p className="text-xs text-brand-800 dark:text-brand-300">
                      Encrypted with AES-256-GCM before it touches the database. Buyers only ever
                      receive it after a successful payment.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" variant="outline" disabled={rotating || !newKey.trim()}>
                      {rotating ? 'Updating…' : 'Replace key'}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Orders */}
              <div className="bg-white dark:bg-navy-800/50 rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Orders</h2>
                {orders.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No orders yet.</p>
                ) : (
                  <div className="space-y-3">
                    {orders.map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-navy-700 p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {o.buyerOrg}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(o.createdAt).toLocaleDateString()} · {o.status}
                            {o.apiKeyDelivered ? ' · key delivered' : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            ${o.amountUsd}
                          </p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            you +${o.sellerEarningUsd}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
