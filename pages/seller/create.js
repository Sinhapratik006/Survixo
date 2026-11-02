import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Sun, Moon, Eye, EyeOff, ShieldCheck, Info } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { api } from '../../lib/api.js';
import { useRouter } from 'next/router';

const PLATFORM_FEE_RATE = 0.2; // 20% platform commission

export default function SellerCreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [models, setModels] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const storedTheme = typeof window !== 'undefined' && localStorage.getItem('nexovra-theme');
    const systemDark = prefersDark ? 'dark' : 'light';
    const storedDark = storedTheme ? storedTheme : systemDark;
    setDark(storedDark === 'dark');
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', storedDark === 'dark');
    }
  }, []);

  const toggleTheme = () => {
    setDark((dark) => {
      const next = !dark;
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
  const maskedPreview = apiKey
    ? (apiKey.length > 8 ? `••••••••${apiKey.slice(-4)}` : '••••')
    : '';

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/api/marketplace/listings', {
        title: name.trim(),
        description: description.trim(),
        priceUsd: priceNum,
        apiKey: apiKey.trim(),
        models: models.split(',').map((m) => m.trim()).filter(Boolean),
      });
      setLoading(false);
      window.location.href = '/seller/dashboard';
    } catch (err) {
      setError(err.message || 'Failed to create listing');
      setLoading(false);
    }
  };

  const labelCls = 'block text-sm font-medium text-slate-600 dark:text-slate-400 uppercase tracking-tighter mb-2';

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
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
              <a href="/seller/create" className="text-sm font-medium text-brand-600 dark:text-brand-400">
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

      <main className="py-8">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-navy-800/50 rounded-xl p-8 mb-8 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              Create API Key Listing
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Your key is encrypted at rest and stays hidden until someone buys it.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/10 text-sm text-rose-700 dark:text-rose-400">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-6">
              <div>
                <label className={labelCls}>Listing Name</label>
                <Input
                  placeholder="e.g. GPT-4 Access Key"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <label className={labelCls}>Description</label>
                <Input
                  placeholder="Describe the API key access"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                />
              </div>

              <div>
                <label className={labelCls}>Price (USD per 1M tokens)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 1.17"
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
                  placeholder="e.g. gpt-4, gpt-4-turbo, claude-3-opus"
                  value={models}
                  onChange={(e) => setModels(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Comma-separated model names</p>
              </div>

              <div>
                <label className={labelCls}>Your API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    required
                    maxLength={2000}
                    autoComplete="off"
                    spellCheck={false}
                    className="block w-full rounded-xl border px-4 py-2.5 pr-11 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-navy-400 bg-white dark:bg-navy-900/40 border-slate-200 dark:border-navy-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:border-brand-500 transition-all duration-200 hover:border-slate-300 dark:hover:border-navy-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    tabIndex={-1}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {maskedPreview && (
                  <p className="mt-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    Buyers will see: {maskedPreview}
                  </p>
                )}

                <div className="mt-3 flex gap-2 rounded-lg border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 p-3">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                  <p className="text-xs text-brand-800 dark:text-brand-300">
                    Encrypted with AES-256-GCM and stored in the database.
                    It is <span className="font-semibold">never shown</span> in the marketplace,
                    search results, or to sellers of other listings — a buyer only receives the
                    full key after their payment succeeds.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => router.push('/seller/dashboard')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Creating…' : 'Create Listing'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
