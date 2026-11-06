import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import { cn } from '../components/lib/cn.js';
import { Search, Filter, ArrowRight, Globe, Bot, ShieldCheck, Clock, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';

const sortLabels = {
  price: 'Cheapest first',
  latency: 'Fastest',
  popularity: 'Most popular',
  quality: 'Highest quality',
  context: 'Largest context',
  name: 'A to Z',
  discount: 'Biggest discount',
};

export default function ModelsPage() {
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [sort, setSort] = useState('popularity');
  const [minContext, setMinContext] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [capability, setCapability] = useState('');
  const [available, setAvailable] = useState('');

  const [models, setModels] = useState([]);
  const [total, setTotal] = useState(0);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  const capabilities = ['chat', 'vision', 'tools', 'streaming', 'json_mode'];

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (query) params.search = query;
      if (providerFilter) params.provider = providerFilter;
      if (sort) params.sort = sort;
      if (minContext) params.minContext = minContext;
      if (maxPrice) params.maxPrice = maxPrice;
      if (capability) params.capability = capability;
      if (available) params.available = available;

      const [mRes, pRes] = await Promise.all([
        api.get('/api/models', { query: params }),
        api.get('/api/providers'),
      ]);
      setModels(mRes.data.data || []);
      setTotal(mRes.data.total || 0);
      setProviders(pRes.data.data || []);
    } catch (e) {
      console.error(e);
      setModels([]);
      setTotal(0);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const blend = (input, output) => input * 0.75 + output * 0.25;
  const discount = (baseline, offer) => {
    if (!baseline || !offer || baseline <= 0) return null;
    return Math.max(0, Math.min(100, ((1 - offer / baseline) * 100)));
  };

  const updateQuery = (key, value) => {
    if (key === 'provider') setProviderFilter(value);
    if (key === 'sort') setSort(value);
    if (key === 'minContext') setMinContext(value);
    if (key === 'maxPrice') setMaxPrice(value);
    if (key === 'capability') setCapability(value);
    if (key === 'available') setAvailable(value);
    void fetchData();
  };

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <section className="py-6 md:py-10">
        <div className="container-page">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              <h1 className="text-h1 text-slate-900 dark:text-white mb-1">Model marketplace</h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {total} model{total !== 1 ? 's' : ''} · open offers from independent sellers
            </p>
          </div>

          {/* Filters */}
          <Card className="p-5 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search models, providers…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void fetchData();
                  }}
                  className="pl-10"
                />
              </div>
              <div className="col-span-1 sm:col-span-1 xl:col-span-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Provider</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setProviderFilter(''); void fetchData(); }}
                    disabled={!providerFilter}
                    className="flex-1 text-left h-9 text-xs"
                  >
                    {providerFilter ? providers.find((p) => p.id === providerFilter)?.name || providerFilter : 'All'}
                  </Button>
                </div>
              </div>
              <div className="col-span-1 sm:col-span-1 xl:col-span-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Sort by</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {}}
                    className="flex-1 text-left h-9 text-xs"
                  >
                    {sortLabels[sort]}
                  </Button>
                </div>
              </div>
              <div className="col-span-1 sm:col-span-1 xl:col-span-1">
                <Input
                  type="number"
                  label="Min context"
                  value={minContext}
                  onChange={(e) => setMinContext(e.target.value)}
                  onBlur={() => updateQuery('minContext', minContext)}
                  className="h-9"
                />
              </div>
              <div className="col-span-1 sm:col-span-1 xl:col-span-1">
                <Input
                  type="number"
                  step="0.01"
                  label="Max price/1M out"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  onBlur={() => updateQuery('maxPrice', maxPrice)}
                  className="h-9"
                />
              </div>
              <div className="col-span-1 sm:col-span-1 xl:col-span-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setAvailable(available === 'true' ? '' : 'true'); void fetchData(); }}
                  className="flex-1 text-left h-9 text-xs"
                >
                  {available === 'true' ? 'Hide unavailable' : 'Available only'}
                </Button>
              </div>
            </div>
          </Card>

          {/* Results table */}
          <Card className="overflow-hidden shadow-sm border border-slate-200 dark:border-navy-700">
            <div className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30 px-6 py-3 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Bot className="h-3.5 w-3.5" />
                <span>{total} model{total !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30">
                    <th className="px-6 py-3 font-medium text-slate-900 dark:text-white">Model</th>
                    <th className="px-6 py-3 font-medium text-slate-900 dark:text-white">Provider</th>
                    <th className="px-6 py-3 font-medium text-slate-900 dark:text-white">Best price / 1M out</th>
                    <th className="px-6 py-3 font-medium text-slate-900 dark:text-white">Discount</th>
                    <th className="px-6 py-3 font-medium text-slate-900 dark:text-white">Offers</th>
                    <th className="px-6 py-3 font-medium text-slate-900 dark:text-white">Context</th>
                    <th className="px-6 py-3 font-medium text-slate-900 dark:text-white">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-slate-500">Loading marketplace…</td>
                    </tr>
                  ) : models.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-slate-500">No models match your filters.</td>
                    </tr>
                  ) : (
                    models.map((m) => {
                      const best = m.bestOffer;
                      const blendPrice = best ? blend(best.inputPerM, best.outputPerM) : null;
                      const baseBlend = m.baseline ? blend(m.baseline.inputPerM, m.baseline.outputPerM) : null;
                      const disc = discount(baseBlend, blendPrice);
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-700/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-navy-700 flex items-center justify-center text-xs font-medium text-slate-500 dark:text-slate-400">
                                {m.provider.name.charAt(0)}
                              </div>
                              <div>
                                <div className="font-medium text-slate-900 dark:text-white">{m.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{m.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{m.provider.name}</td>
                          <td className="px-6 py-4">
                            {best ? (
                              <span className="font-mono font-medium text-slate-900 dark:text-white">${best.outputPerM.toFixed(4)}</span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {disc !== null ? (
                              <span className={`text-xs font-bold ${disc > 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                −{disc.toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{m.offerCount}</td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {m.contextWindow ? (m.contextWindow / 1000).toFixed(0) + 'k' : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <Button size="sm" asChild>
                              <Link href={`/market/${m.id}`}>View offers</Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {models.length > 0 && !loading && (
              <div className="border-t border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30 px-6 py-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Showing {models.length} of {total}</span>
                <span>Sorted by: {sortLabels[sort]}</span>
              </div>
            )}
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
