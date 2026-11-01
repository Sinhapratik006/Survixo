import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Card from '../components/Card';
import Button from '../components/Button';
import {
  BarChart3, Monitor, DollarSign, Activity, TrendingUp, Clock,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api, formatUsd, formatTokens, formatPct } from '../lib/api.js';

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/analytics/overview', { query: { days } });
        if (!cancelled) setData(res.data);
      } catch (e) {
        console.error(e);
        setData(null);
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
        <section className="py-10"><div className="container-page"><h1 className="text-h1 text-slate-900 dark:text-white">Market analytics</h1><p className="text-slate-500 dark:text-slate-400">Loading…</p></div></section>
        <Footer />
      </div>
    );
  }

  const t = data?.totals || {};
  const savings = data?.savings || [];
  const volume = data?.requestVolume || [];
  const activity = data?.activity || [];

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="border-b border-slate-200/60 dark:border-navy-700/30 bg-white/60 dark:bg-navy-950/60 backdrop-blur-md sticky top-0 z-20">
        <div className="container-page py-4">
          <h1 className="text-h1 text-slate-900 dark:text-white">Market analytics</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Aggregate marketplace usage and realized pricing.</p>
        </div>
      </div>

      <div className="container-page py-10">
        <div className="flex items-center gap-3 mb-8">
          {[7, 28, 90].map((d) => (
            <Button key={d} variant={days === d ? 'primary' : 'outline'} size="sm" onClick={() => setDays(d)}>
              {d}D
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard label="Requests" value={t.requests?.toLocaleString() ?? '0'} icon={<Activity className="w-5 h-5" />} />
          <StatCard label="Models listed" value={t.modelsListed ?? 0} icon={<Monitor className="w-5 h-5" />} />
          <StatCard label="Active offers" value={t.activeOffers ?? 0} icon={<TrendingUp className="w-5 h-5" />} />
          <StatCard label="Sellers" value={t.sellers ?? 0} icon={<UsersIcon className="w-5 h-5" />} />
          <StatCard label="Healthy offers" value={t.healthyOffers ?? 0} icon={<CheckIcon className="w-5 h-5" />} />
          <StatCard label="Realized savings" value={formatUsd(savings.reduce((a, b) => a + (b.realizedUsd || 0), 0))} icon={<DollarSign className="w-5 h-5" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Request volume */}
          <div className="lg:col-span-7">
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Requests routed</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={volume}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200 dark:stroke-navy-700" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v) => (v / 1e6).toFixed(0) + 'M'} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="success" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Savings */}
          <div className="lg:col-span-5">
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Realized savings</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={savings}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200 dark:stroke-navy-700" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v) => '$' + (v / 1e3).toFixed(0) + 'K'} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="realizedUsd" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  ${savings.reduce((a, b) => a + (b.realizedUsd || 0), 0).toFixed(0)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">realized (est.)</span>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-tighter">{label}</p>
        <div className="w-6 h-6 rounded bg-slate-100 dark:bg-navy-800/50 flex items-center justify-center text-slate-400 dark:text-slate-500">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
    </Card>
  );
}

function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M23 21v-2a4 4 0 00-3-3.87M7 13a2 2 0 11-4 0 2 2 0 004 0z" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}
