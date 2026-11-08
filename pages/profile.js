import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import Badge from '../components/ui/badge';
import { api } from '../lib/api.js';
import {
  User,
  Wallet,
  ShieldCheck,
  Loader2,
  ArrowRight,
} from 'lucide-react';

const NETWORK_LABELS = {
  ETHEREUM: 'Ethereum (ERC-20)',
  POLYGON: 'Polygon',
  ARBITRUM: 'Arbitrum One',
  SOLANA: 'Solana',
  BITCOIN: 'Bitcoin',
};

function Avatar({ user, className }) {
  const label = user?.name || user?.email || 'User';
  const initials = label
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={label} className={className} />;
  }
  return (
    <div
      className={className}
      style={{
        backgroundColor: `hsl(${(label.charCodeAt(0) * 37) % 360}, 60%, 92%)`,
      }}
    >
      {initials}
    </div>
  );
}

export default function ProfilePage() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');
  const [nameError, setNameError] = useState('');

  // Require a session — signed-out visitors go to /login and come back here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/auth/me');
        if (cancelled) return;
        if (res.data && res.data.user) setCheckingAuth(false);
        else window.location.href = '/login?next=/profile';
      } catch (e) {
        if (cancelled) return;
        if (e.status === 401 || e.status === 403) {
          window.location.href = '/login?next=/profile';
        } else {
          setCheckingAuth(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load profile data.
  useEffect(() => {
    if (checkingAuth) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [meRes, walletRes] = await Promise.allSettled([
          api.get('/api/auth/me'),
          api.get('/api/marketplace/payout-account'),
        ]);
        if (cancelled) return;
        if (meRes.status === 'fulfilled' && meRes.value.data.user) {
          setUser(meRes.value.data.user);
          setName(meRes.value.data.user.name ?? '');
        }
        if (walletRes.status === 'fulfilled') {
          setWallet(walletRes.value.data.account ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkingAuth]);

  const handleUpdateName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    setNameMsg('');
    setNameError('');
    try {
      await api.patch('/api/settings/profile', { name: name.trim() });
      setNameMsg('Name updated.');
      setUser((prev) => (prev ? { ...prev, name: name.trim() } : prev));
    } catch (err) {
      setNameError(err.message || 'Could not update name.');
    } finally {
      setSavingName(false);
    }
  };

  const createdAt = user ? new Date(user.createdAt) : null;
  const memberSince = createdAt && !Number.isNaN(createdAt.getTime())
    ? createdAt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '—';

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

      <section className="py-8">
        <div className="container-page">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-h1 text-slate-900 dark:text-white mb-1">Profile</h1>
              <p className="text-slate-600 dark:text-slate-300">
                Manage your account details and payout wallet.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading your profile…</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-12 gap-8">
              {/* ───────── Profile details ───────── */}
              <div className="lg:col-span-7">
                <Card className="p-0">
                  <div className="p-6 border-b border-slate-100 dark:border-navy-800/30">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      Account details
                    </h2>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-4 mb-6">
                      <Avatar
                        user={user}
                        className="w-14 h-14 rounded-2xl flex-shrink-0 items-center justify-center font-bold text-slate-900 dark:text-white overflow-hidden border border-slate-200 dark:border-navy-700"
                      />
                      <div className="min-w-0">
                        <p className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                          {user?.name || 'No name set'}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                          {user?.email || '—'}
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleUpdateName} className="space-y-4">
                      <Input
                        label="Full name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        leftIcon={<User className="w-4 h-4" />}
                      />
                      {nameError && (
                        <p className="text-[10px] text-rose-500 dark:text-rose-400 font-medium leading-none">
                          {nameError}
                        </p>
                      )}
                      {nameMsg && (
                        <p className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium leading-none">
                          {nameMsg}
                        </p>
                      )}
                      <Button type="submit" variant="primary" disabled={savingName}>
                        {savingName ? (
                          <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving…</>
                        ) : (
                          'Save name'
                        )}
                      </Button>
                    </form>

                    <div className="mt-8 rounded-xl border border-slate-100 dark:border-navy-800/30 bg-slate-50 dark:bg-navy-900/30 p-5">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                        Account
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center text-slate-900 dark:text-white">
                          <span className="text-slate-500 dark:text-slate-400">Email</span>
                          <span>{user?.email || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-900 dark:text-white">
                          <span className="text-slate-500 dark:text-slate-400">Member since</span>
                          <span>{memberSince}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-900 dark:text-white">
                          <span className="text-slate-500 dark:text-slate-400">Role</span>
                          <Badge variant="outline">{user?.role?.toUpperCase() ?? 'USER'}</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* ───────── Wallet ───────── */}
              <div className="lg:col-span-5">
                <Card className="p-0">
                  <div className="p-6 border-b border-slate-100 dark:border-navy-800/30">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Wallet className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      Payout wallet
                    </h2>
                  </div>
                  <div className="p-6">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                      Where your seller earnings are paid. Payouts are released to verified wallets only.
                    </p>

                    {wallet ? (
                      <div className="rounded-xl border border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-900/40 p-4 mb-5">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Current wallet
                          </p>
                          {wallet.isVerified ? (
                            <Badge variant="default" className="ml-auto flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="ml-auto">Pending verification</Badge>
                          )}
                        </div>
                        <div className="font-mono text-sm text-slate-900 dark:text-white break-all mb-1">
                          {wallet.walletAddress}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Network: {NETWORK_LABELS[wallet.network] ?? wallet.network}
                          {!wallet.isVerified && (
                            <span className="ml-2"> · verification pending — funds are not released until ops approves this address</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-navy-600 p-4 mb-5 text-sm text-slate-500 dark:text-slate-400 text-center">
                        No wallet connected yet. Add one in your payout settings so you can receive earnings.
                      </div>
                    )}

                    <Button
                      asChild
                      variant="outline"
                      className="w-full"
                      onClick={() => (window.location.href = '/seller/payouts')}
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      {wallet ? 'Manage wallet' : 'Add wallet'}
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
