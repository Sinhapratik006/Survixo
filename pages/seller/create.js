import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Menu, X, Sun, Moon, Eye, EyeOff, ShieldCheck, Info, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { api } from '../../lib/api.js';
import {
  CREDIT_BUY_PCT,
  CREDIT_SELL_PCT,
  CREDIT_PLATFORM_MARGIN_PCT,
  sellerPayout,
  buyerPrice,
  platformMargin,
} from '../../lib/pricing.js';
import { useRouter } from 'next/router';

export default function SellerCreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creditValue, setCreditValue] = useState('');
  const [models, setModels] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [keyCheck, setKeyCheck] = useState({ state: 'idle' });
  const [autoFilled, setAutoFilled] = useState({ name: false, models: false });
  // Once a seller manually touches a field we stop auto-filling it, so an
  // auto-filled value is never clobbered on the next key verification.
  const nameUserTouched = useRef(false);
  const modelsUserTouched = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const storedTheme = typeof window !== 'undefined' && localStorage.getItem('apitradex-theme');
    const systemDark = prefersDark ? 'dark' : 'light';
    const storedDark = storedTheme ? storedTheme : systemDark;
    setDark(storedDark === 'dark');
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', storedDark === 'dark');
    }
  }, []);

  // Require a session before the form can be used. Signed-out visitors are
  // sent to /login and returned here afterwards, instead of filling in the
  // form only to get "Authentication required" on submit.
  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    (async () => {
      const goToLogin = () => router.replace('/login?next=/seller/create');
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

  const toggleTheme = () => {
    setDark((dark) => {
      const next = !dark;
      if (typeof window !== 'undefined') {
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('apitradex-theme', next ? 'dark' : 'light');
      }
      return next;
    });
  };

  const creditNum = Number(creditValue) || 0;
  const payoutUsd = sellerPayout(creditNum);
  const buyerUsd = buyerPrice(creditNum);
  const marginUsd = platformMargin(creditNum);
  const maskedPreview = apiKey
    ? (apiKey.length > 8 ? `••••••••${apiKey.slice(-4)}` : '••••')
    : '';

  // Probe the pasted key against the provider so sellers see problems
  // immediately. The server runs the same check and refuses to publish a
  // listing whose key does not authenticate.
  useEffect(() => {
    const key = apiKey.trim();
    if (key.length < 12) {
      setKeyCheck({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setKeyCheck({ state: 'checking' });
    setAutoFilled({ name: false, models: false });
    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/api/marketplace/verify-key', {
          apiKey: key,
          baseUrl: baseUrl.trim() || undefined,
        });
        if (!cancelled) {
          setKeyCheck({ state: res.data.ok ? 'ok' : 'fail', ...res.data });
          // Auto-fill the listing name and models from the detected provider so
          // sellers don't have to type them by hand. Only fill empty fields and
          // never overwrite something the seller has already typed.
          if (res.data.ok) {
            const provider = res.data.provider;
            const detectedModels = res.data.models || [];
            if (!nameUserTouched.current && !name.trim() && provider) {
              setName(`${provider} API Key`);
              setAutoFilled((prev) => ({ ...prev, name: true }));
            }
            if (!modelsUserTouched.current && !models.trim() && detectedModels.length) {
              setModels(detectedModels.join(', '));
              setAutoFilled((prev) => ({ ...prev, models: true }));
            }
          }
        }
      } catch (err) {
        if (!cancelled) setKeyCheck({ state: 'fail', detail: err.message || 'Could not reach the verification service.' });
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apiKey, baseUrl]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/api/marketplace/listings', {
        title: name.trim(),
        description: description.trim(),
        creditValueUsd: creditNum,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        models: models.split(',').map((m) => m.trim()).filter(Boolean),
      });
      setLoading(false);
      window.location.href = '/seller/dashboard';
    } catch (err) {
      setError(err.message || 'Failed to create listing');
      setLoading(false);
    }
  };

  const labelCls = 'block text-sm font-medium text-slate-600 dark:text-slate-300 uppercase tracking-tighter mb-2';

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
      <nav className="sticky top-0 z-50 border-b border-slate-200/60 dark:border-navy-700/30 bg-white/80 dark:bg-navy-950/80 backdrop-blur-md">
        <div className="container-page">
          <div className="flex items-center justify-between h-16">
            <a href="/seller/dashboard" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30 relative overflow-hidden">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 20 L12 4 L18 20"/>
                  <path d="M9 14 L15 14"/>
                  <path d="M20 4 L20 20"/>
                  <path d="M18 6 L22 6"/>
                </svg>
              </div>
              <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">ApiTradeX</span>
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
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
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
                  onChange={(e) => { nameUserTouched.current = true; setName(e.target.value); }}
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
                <label className={labelCls}>Credit value (USD)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={creditValue}
                  onChange={(e) => setCreditValue(e.target.value)}
                  placeholder="e.g. 100"
                  required
                />
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-600">
                  Face value of the API credits you are selling — we buy them at {CREDIT_BUY_PCT}% and
                  list them for buyers at {CREDIT_SELL_PCT}%.
                </p>
                {creditNum > 0 && (
                  <div className="mt-2 rounded-lg bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-700 p-3 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1">
                        <Info className="w-3 h-3" /> API credits worth
                      </span>
                      <span className="font-medium">${creditNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-300 mt-1">
                      <span>We buy them at {CREDIT_BUY_PCT}%</span>
                      <span>${payoutUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-300 mt-1">
                      <span>Buyers pay {CREDIT_SELL_PCT}%</span>
                      <span>${buyerUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-300 mt-1">
                      <span>Platform keeps {CREDIT_PLATFORM_MARGIN_PCT}%</span>
                      <span>${marginUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 mt-1 pt-1 border-t border-slate-200 dark:border-navy-700">
                      <span className="font-medium">You receive per sale</span>
                      <span className="font-medium">${payoutUsd.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Models</label>
                <Input
                  placeholder="e.g. gpt-4, gpt-4-turbo, claude-3-opus"
                  value={models}
                  onChange={(e) => { modelsUserTouched.current = true; setModels(e.target.value); }}
                />
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-600">Comma-separated model names</p>
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
                  <p className="mt-1.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                    Buyers will see: {maskedPreview}
                  </p>
                )}

                {keyCheck.state === 'checking' && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Checking key health against the provider…
                  </p>
                )}
                {keyCheck.state === 'ok' && (
                  <>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>
                        Key verified — {keyCheck.provider}
                        {keyCheck.modelCount ? `, ${keyCheck.modelCount} model(s) available` : ''}.
                      </span>
                    </p>
                    {(autoFilled.name || autoFilled.models) && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>
                          Listing{' '}
                          {autoFilled.name && autoFilled.models
                            ? 'name and models'
                            : autoFilled.name
                              ? 'name'
                              : 'models'} pre-filled from the detected provider — edit them if needed.
                        </span>
                      </p>
                    )}
                  </>
                )}
                {keyCheck.state === 'fail' && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>{keyCheck.detail}</span>
                  </p>
                )}

                <div className="mt-4">
                  <label className={labelCls}>
                    API base URL{' '}
                    <span className="normal-case text-slate-400 dark:text-slate-600">(optional)</span>
                  </label>
                  <Input
                    placeholder="https://api.openai.com/v1"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    maxLength={300}
                    spellCheck={false}
                  />
                  <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-600">
                    Where your key lives — we verify it there. A bare host like{' '}
                    <span className="font-mono">api.openai.com/v1</span> is fine (https:// assumed).
                    Leave it blank and we check the major providers automatically.
                  </p>
                </div>

                <div className="mt-3 flex gap-2 rounded-lg border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 p-3">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                  <p className="text-xs text-brand-800 dark:text-brand-300">
                    Encrypted with AES-256-GCM and stored in the database.
                    It is <span className="font-semibold">never shown</span> in the marketplace,
                    search results, or to sellers of other listings — a buyer only receives the
                    full key after their payment succeeds. Keys are verified live before a listing
                    can go live, so dead or made-up keys are rejected.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => router.push('/seller/dashboard')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || keyCheck.state === 'checking'}>
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
