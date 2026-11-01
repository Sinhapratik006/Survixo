import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  Activity, DollarSign, TrendingUp, Clock, RefreshCw, ExternalLink, Zap, Users,
} from 'lucide-react';
import { api, formatUsd, formatTokens, formatPct } from '../lib/api.js';
const DollarSignIcon = () => (
  <svg className="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CreditCardIcon = () => (
  <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 12v-2c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2m10 8H3v-8c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v8zM9 12h6m-6 4h6m-6-3h.01M17 16h.01" />
  </svg>
);

function UserIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

export default function DashboardPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sRes, rRes] = await Promise.all([
          api.get('/api/usage/summary', { query: { days: 30 } }),
          api.get('/api/usage/requests', { query: { limit: 8 } }),
        ]);
        if (!cancelled) {
          setSummary(sRes.data);
          setRecent(rRes.data.data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 600));
    setRefreshing(false);
    window.location.reload();
  };

  const l30 = summary?.last30d || {};

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950">
        <Navbar />
        <section className="py-8"><div className="container-page"><h1 className="text-h1 text-slate-900 dark:text-white">Dashboard</h1><p className="text-slate-500 dark:text-slate-400">Loading…</p></div></section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <section className="py-8">
        <div className="container-page">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-h1 text-slate-900 dark:text-white mb-1">Dashboard</h1>
                <p className="text-slate-600 dark:text-slate-300">
                  Monitor your usage, spend, and request health at a glance.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-all duration-200"
              >
                <RefreshCw className="w-4 h-4 animate-[spin_1s_linear_infinite]" />
              </button>
              <Button asChild>
                <a href="/app/keys">Add API key</a>
              </Button>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <Card hover className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Available balance</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Available to spend</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-navy-800/50 flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <DollarSignIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatUsd(l30.costUsd ?? 0)}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-navy-700 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 h-[6px] rounded-full w-2/3" />
              </div>
            </Card>
            <Card hover className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Last 30d spend</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">vs baseline</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                  <CreditCardIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-white line-through">
                  {formatUsd(l30.baselineUsd ?? 0)}
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  −{formatPct(((l30.baselineUsd - l30.costUsd) / l30.baselineUsd) * 100)}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-navy-700 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 h-[6px] rounded-full w-1/3" />
              </div>
            </Card>
            <Card hover className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Requests (30d)</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Across all endpoints</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {l30.requests?.toLocaleString() ?? '0'}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-navy-700 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 h-[6px] rounded-full w-3/4" />
              </div>
            </Card>
            <Card hover className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Tokens</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Input + output</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {formatTokens(l30.tokens ?? 0)}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-navy-700 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 h-[6px] rounded-full w-1/2" />
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Spend over time */}
            <div className="lg:col-span-2">
              <Card className="p-0">
                <div className="p-6 border-b border-slate-100 dark:border-navy-800/30">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3Icon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                    Spend over time
                  </h3>
                </div>
                <div className="p-6">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary?.series || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200 dark:stroke-navy-700" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tickFormatter={(v) => '$' + v.toFixed(0)} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="costUsd" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </Card>
            </div>

            {/* Recent requests */}
            <div className="lg:col-span-1">
              <Card className="p-0">
                <div className="p-6 border-b border-slate-100 dark:border-navy-800/30">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                      Recent requests
                    </h3>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/app/usage">View all</Link>
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-navy-800/30">
                  {recent.length ? (
                    recent.map((r) => (
                      <div key={r.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-navy-800/30 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-lg bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs">
                              {r.requestedModel.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.requestedModel}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{r.seller ?? '—'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-medium text-slate-900 dark:text-white">${r.costUsd.toFixed(4)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>{r.status}</span>
                          <span>•</span>
                          <span>{r.latencyMs ? r.latencyMs + 'ms' : '—'}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm">No recent requests.</div>
                  )}
                </div>
              </Card>
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-8 grid lg:grid-cols-3 gap-6">
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-6">Quick actions</h3>
              <div className="space-y-3">
                <Button className="w-full text-sm text-left bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-navy-700" asChild>
                  <a href="/app/keys">
                    <Zap className="w-4 h-4 mr-2" /> Create API key
                  </a>
                </Button>
                <Button className="w-full text-sm text-left bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-navy-700">
                  <Clock className="w-4 h-4 mr-2" /> Set budget limit
                </Button>
                <Button className="w-full text-sm text-left bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-navy-700">
                  <Users className="w-4 h-4 mr-2" /> Invite teammate
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function BarChart3Icon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
