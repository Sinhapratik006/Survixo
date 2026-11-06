import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Button from '../components/Button';
import Card from '../components/Card';
import Input from '../components/Input';
import { cn } from '../components/lib/cn.js';
import { DollarSign, BarChart3, Layers, TrendingUp, Copy, ArrowRight } from 'lucide-react';
import { api, formatUsd } from '../lib/api.js';

export default function CalculatorPage() {
  const [models, setModels] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [monthlySpend, setMonthlySpend] = useState('1000');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/models', { query: { sort: 'popularity' } });
        const list = (res.data.data || []).filter((m) => m.bestOffer);
        setModels(list);
        if (list.length && !selectedId) setSelectedId(list[0].id);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selected = models.find((m) => m.id === selectedId) || null;
  const spend = parseFloat(monthlySpend.replace(/,/g, '')) || 0;
  const baselineOut = selected?.baseline?.outputPerM ?? 0;
  const surplusOut = selected?.bestOffer?.outputPerM ?? 0;

  const monthlyTokens = baselineOut > 0 ? spend / baselineOut : 0; // in 1M units
  const surplusBill = monthlyTokens * surplusOut;
  const savings = spend - surplusBill;
  const discountPct = spend > 0 ? (savings / spend) * 100 : 0;

  const fmtTokens = (v) => {
    const abs = Math.abs(v);
    if (abs >= 1e9) return (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (abs / 1e3).toFixed(1) + 'K';
    return Math.round(abs).toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950">
        <Navbar />
        <section className="py-16"><div className="container-page"><h1 className="text-h1 text-slate-900 dark:text-white">Cost Calculator</h1><p className="text-slate-500 dark:text-slate-400">Loading…</p></div></section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <section className="py-6 md:py-10">
        <div className="container-page">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              <div>
                <h1 className="text-h1 text-slate-900 dark:text-white mb-1">Savings calculator</h1>
                <p className="text-slate-600 dark:text-slate-300">
                  Pick a model, set your monthly spend, see the difference.
                </p>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Controls */}
            <div className="lg:col-span-4 space-y-6">
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Layers className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Select a model</h3>
                </div>
                <div className="space-y-3">
                  {models.map((m) => {
                    const disc = m.bestOffer?.discountPct ?? 0;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedId(m.id)}
                        className={cn(
                          'w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors text-left',
                          selectedId === m.id
                            ? 'ring-2 ring-brand-600 bg-brand-50/30 dark:bg-brand-900/10 border-brand-600/50'
                            : 'bg-white dark:bg-navy-800 border-slate-200 dark:border-navy-700 hover:bg-slate-50 dark:hover:bg-navy-700/50',
                        )}
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{m.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {m.provider.name} · {disc > 0 ? disc.toFixed(0) + '% cheaper' : ''}
                          </div>
                        </div>
                        <span className={`text-xs font-bold ${disc > 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                          −{disc.toFixed(0)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>

              <Card>
                <div className="p-6">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-6">Monthly usage</h3>
                  <div className="space-y-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-slate-900 dark:text-white">${spend.toLocaleString()}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">per month</span>
                    </div>
                    <input
                      type="range"
                      min="100"
                      max="10000"
                      step="100"
                      value={spend}
                      onChange={(e) => setMonthlySpend(e.target.value)}
                      className="w-full h-2 bg-slate-200 dark:bg-navy-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
                    />
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>$100</span>
                      <span>$10,000</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Est. tokens/mo</span>
                      <span className="font-mono font-medium text-slate-900 dark:text-white">{fmtTokens(Math.round(monthlyTokens * 1e6))}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Results */}
            <div className="lg:col-span-8 space-y-6">
              <Card className="overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Monthly estimate</h3>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Direct vs. Survixo
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-navy-700">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                        Your current provider
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-slate-900 dark:text-white line-through">${spend.toFixed(2)}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">/ month</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {baselineOut.toFixed(4)} / 1M output
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-brand-50/50 dark:bg-brand-900/10 border border-brand-200/50 dark:border-brand-900/30">
                      <div className="text-xs font-medium text-brand-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                        Survixo
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-slate-600 dark:text-slate-300">${surplusBill.toFixed(2)}</span>
                        <span className="text-xs text-slate-600 dark:text-slate-300">/ month</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        @ active market price · {surplusOut.toFixed(4)} / 1M output
                      </div>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-white">Total with Survixo</div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white">${surplusBill.toFixed(2)}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Estimated monthly bill</div>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1.5 rounded ${discountPct > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-navy-700 text-slate-500'}`}>
                      {discountPct.toFixed(1)}% cut
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-100 dark:border-navy-700 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Savings vs direct</div>
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">−{formatUsd(savings)}</div>
                    </div>
                    <Button onClick={() => { window.location.href = '/signup'; }}>
                      Claim discount <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {models.slice(0, 3).map((m) => {
                  const tokens = spend / (m.baseline?.outputPerM || 1);
                  const bill = tokens * (m.bestOffer?.outputPerM || 0);
                  const save = spend - bill;
                  const disc = m.bestOffer?.discountPct ?? 0;
                  return (
                    <Card key={m.id} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{m.provider.name}</div>
                        <span className={`text-xs font-bold ${disc > 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                          −{disc.toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{m.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        ${m.bestOffer?.outputPerM.toFixed(4)}/1M output
                      </div>
                      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        At ${spend.toLocaleString()} spend → ${bill.toFixed(2)}/mo
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
