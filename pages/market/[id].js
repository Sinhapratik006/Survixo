import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Badge from '../../components/ui/badge';
import { api, formatUsd, formatTokens, formatPct } from '../../lib/api.js';

export default function MarketDetailPage() {
  const router = useRouter();
  const id = router.query.id;
  const [model, setModel] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await api.get(`/api/models/${id}`);
        if (!cancelled) {
          setModel(res.data.model);
          setOffers(res.data.offers || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950">
        <Navbar />
        <section className="py-10"><div className="container-page"><h1 className="text-h1 text-slate-900 dark:text-white">Loading model…</h1></div></section>
        <Footer />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-navy-950">
        <Navbar />
        <section className="py-10"><div className="container-page"><h1 className="text-h1 text-slate-900 dark:text-white">Model not found</h1><p className="text-slate-600 dark:text-slate-300">The requested model could not be found.</p></div></section>
        <Footer />
      </div>
    );
  }

  const blend = (input, output) => input * 0.75 + output * 0.25;
  const baseBlend = model.baseline ? blend(model.baseline.inputPerM, model.baseline.outputPerM) : null;

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <section className="py-6 md:py-10">
        <div className="container-page">
          <nav className="flex items-center gap-1 text-xs mb-6">
            <Button variant="ghost" size="sm" asChild onClick={() => router.back()}>
              <span className="flex items-center gap-1">← Marketplace</span>
            </Button>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600 dark:text-slate-300 font-medium">{model.name}</span>
          </nav>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="lg:w-1/3">
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-lg font-bold">
                    {model.provider.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-tighter">{model.provider.name}</p>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">{model.name}</h1>
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{model.description ?? 'No description available.'}</p>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-navy-800/30">
                    <p className="text-xs text-slate-600 dark:text-slate-300 uppercase">Context window</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{formatTokens(model.contextWindow ?? 0)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-navy-800/30">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Max output</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{model.maxOutputTokens ? formatTokens(model.maxOutputTokens) : '—'}</p>
                  </div>
                </div>

                {model.capabilities?.length && (
                  <div className="mb-6">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-3">Capabilities</p>
                    <div className="flex flex-wrap gap-2">
                      {model.capabilities.map((c) => (
                        <span key={c.capability} className="px-2.5 py-1 rounded text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-navy-800 border border-slate-200 dark:border-navy-700">
                          {c.capability}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <div className="lg:w-2/3">
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-navy-700">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Available offers</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{offers.length} offer{offers.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-navy-700">
                  {loading ? (
                    <div className="p-6 text-center text-slate-500">Loading offers…</div>
                  ) : offers.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">No active offers for this model.</div>
                  ) : (
                    offers.map((o) => {
                      const disc = baseBlend ? formatPct(((1 - blend(o.inputPerM, o.outputPerM) / baseBlend) * 100)) : null;
                      return (
                        <div key={o.id} className="px-6 py-4 flex items-center justify-between group hover:bg-slate-50/50 dark:hover:bg-navy-700/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-brand-100/50 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                              {o.seller?.name?.charAt(0) || 'S'}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-900 dark:text-white">{o.seller?.name || 'Seller'}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{o.adapter ?? 'api'} · {o.healthStatus}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-baseline gap-1">
                              <span className="text-lg font-bold text-slate-900 dark:text-white">${o.outputPerM.toFixed(4)}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">/ 1M out</span>
                            </div>
                            {disc ? (
                              <span className={`text-xs font-bold ${Number(disc.replace('%','')) > 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand-600 dark:text-brand-400'}`}>
                                −{disc}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={o.healthStatus === 'HEALTHY' ? 'default' : 'secondary'} className="text-xs">
                              {o.healthStatus}
                            </Badge>
                            <Button size="sm" variant="outline" asChild>
                              <a href={`/app/keys`} target="_blank" rel="noopener noreferrer">Get key</a>
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
