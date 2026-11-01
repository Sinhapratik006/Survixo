import React, { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  Activity, DollarSign, Clock, Download, FileCsv, Bot, TrendingUp,
} from 'lucide-react';
import { api, formatUsd, formatTokens, formatPct } from '../../lib/api.js';

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sRes, rRes] = await Promise.all([
          api.get('/api/usage/summary', { query: { days } }),
          api.get('/api/usage/requests', { query: { limit: 15 } }),
        ]);
        if (!cancelled) {
          setSummary(sRes.data);
          setRequests(rRes.data.data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950">
        <Navbar />
        <section className="py-10"><div className="container-page"><h1 className="text-h1 text-slate-900 dark:text-white">Usage</h1><p className="text-slate-500 dark:text-slate-400">Loading…</p></div></section>
        <Footer />
      </div>
    );
  }

  const l30 = summary?.last30d || {};
  const statusColor = (status) => {
    switch (status) {
      case 'SUCCESS': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/10';
      case 'FAILED': return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/10';
      case 'REJECTED': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-navy-800/50';
    }
  };

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="border-b border-slate-200/60 dark:border-navy-700/30 bg-white/60 dark:bg-navy-950/60 backdrop-blur-md sticky top-0 z-20">
        <div className="container-page py-4">
          <h1 className="text-h1 text-slate-900 dark:text-white">Usage</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">View your inference requests, costs, and savings.</p>
        </div>
      </div>

      <div className="container-page py-10">
        {/* Period selector */}
        <div className="flex items-center gap-3 mb-8">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={days === d ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setDays(d)}
            >
              {d}D
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => {
            window.open('/api/usage/export.csv?days=' + days, '_blank');
          }}>
            <Download className="mr-2 h-3 w-3" /> Export CSV
          </Button>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-tighter mb-2">Last {days}d spend</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">${formatUsd(l30.costUsd ?? 0)}</span>
              {l30.baselineUsd && l30.costUsd && (
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 ml-1">
                  −{formatPct(((l30.baselineUsd - l30.costUsd) / l30.baselineUsd) * 100)}
                </span>
              )}
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-tighter mb-2">Baseline spend</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-slate-900 dark:text-white line-through">${formatUsd(l30.baselineUsd ?? 0)}</span>
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-tighter mb-2">Requests</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{l30.requests?.toLocaleString() ?? '0'}</span>
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-tighter mb-2">Tokens</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{formatTokens(l30.tokens ?? 0)}</span>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Spend chart */}
          <div className="lg:col-span-7">
            <Card className="p-0">
              <div className="p-6 border-b border-slate-100 dark:border-navy-800/30">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Spend over time</h3>
              </div>
              <div className="p-6">
                <div className="h-72 w-full">
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
          <div className="lg:col-span-5">
            <Card className="p-0">
              <div className="p-6 border-b border-slate-100 dark:border-navy-800/30">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                  Recent requests
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-navy-800/30">
                {requests.length ? (
                  requests.map((r) => (
                    <div key={r.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-navy-700/30 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-lg bg-brand-100 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs">
                            {r.requestedModel.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.requestedModel}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{r.seller ?? '—'} • {r.source}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-medium text-slate-900 dark:text-white">${r.costUsd.toFixed(4)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', statusColor(r.status))}>
                          {r.status}
                        </span>
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

        {/* By model table */}
        <Card className="mt-8 overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-navy-800/30">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Spend by model</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Last {days} days</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Model</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Spend</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Baseline</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Savings</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Requests</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
                {(summary?.byModel || []).map((m) => {
                  const savings = m.baselineUsd - m.costUsd;
                  return (
                    <tr key={m.modelId} className="hover:bg-slate-50/50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{m.modelId}</div>
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">${m.costUsd.toFixed(4)}</td>
                      <td className="px-6 py-3 text-right text-sm text-slate-500 dark:text-slate-400 line-through">${m.baselineUsd.toFixed(4)}</td>
                      <td className="px-6 py-3 text-right text-sm font-medium text-emerald-600 dark:text-emerald-400">−${savings.toFixed(4)}</td>
                      <td className="px-6 py-3 text-right text-sm text-slate-500 dark:text-slate-400">{m.requests}</td>
                      <td className="px-6 py-3 text-right text-sm text-slate-500 dark:text-slate-400 font-mono">{formatTokens(m.tokens)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
