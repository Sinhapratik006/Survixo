import React, { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Card from '../../components/Card';
import { cn } from '../../components/lib/cn.js';
import { Key, Plus, Copy, Trash2, RotateCw, Banknote, ShieldCheck } from 'lucide-react';
import { api, formatUsd } from '../../lib/api.js';

export default function KeysPage() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(null);
  const [secretValue, setSecretValue] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [openRevoke, setOpenRevoke] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSpend, setCreateSpend] = useState('');

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/api-keys');
      setKeys(res.data.data || []);
    } catch (e) {
      console.error(e);
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchKeys();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const body = { name: createName };
      if (createSpend) body.spendLimitUsd = parseFloat(createSpend);
      const res = await api.post('/api/api-keys', body);
      setSecretValue(res.data.secret);
      setShowSecret(res.data.key.id);
      setOpenCreate(false);
      setCreateName('');
      setCreateSpend('');
      void fetchKeys();
    } catch (err) {
      alert(err.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id) => {
    try {
      await api.post(`/api/api-keys/${id}/revoke`);
      setOpenRevoke(null);
      void fetchKeys();
    } catch (err) {
      alert(err.message || 'Failed to revoke key');
    }
  };

  return (
    <div className="min-h-screen bg-canvas dark:bg-navy-950">
      <Navbar />

      <div className="border-b border-slate-200/60 dark:border-navy-700/30 bg-white/60 dark:bg-navy-950/60 backdrop-blur-md sticky top-0 z-20">
        <div className="container-page py-4">
          <h1 className="text-h1 text-slate-900 dark:text-white">API keys</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            One key gives you access to every model in the marketplace.
          </p>
        </div>
      </div>

      <div className="container-page py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-brand-100/50 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <Key className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your API keys</h2>
          </div>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create key
          </Button>
        </div>

        <Card className="overflow-hidden shadow-sm border border-slate-200 dark:border-navy-700">
          <div className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30 px-6 py-4 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5" />
              <span>API keys</span>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-navy-700">
            {loading ? (
              <div className="px-6 py-16 text-center text-slate-500">Loading keys…</div>
            ) : keys.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-navy-800/30 flex items-center justify-center mx-auto mb-3 text-slate-500">
                  <Key className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">No API keys yet</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Create your first key to start calling the marketplace API.
                </p>
                <Button variant="outline" onClick={() => setOpenCreate(true)} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" /> Create key
                </Button>
              </div>
            ) : (
              keys.map((key) => (
                <div key={key.id} className="px-6 py-4 flex items-center justify-between group hover:bg-slate-50/50 dark:hover:bg-navy-700/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-brand-100/50 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400">
                      <Key className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{key.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {key.project ? `${key.project.name} (${key.project.environment})` : 'Personal workspace'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden md:flex flex-col items-end gap-1">
                      <span className="text-xs font-mono text-slate-900 dark:text-white truncate max-w-xs">{key.maskedKey}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {key.spentUsd > 0 ? `Spent: ${formatUsd(key.spentUsd)}` : 'No spend yet'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(key.maskedKey);
                        }}
                      >
                        <Copy className="h-3 w-3" /> Copy mask
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setOpenRevoke(key.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${key.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/30 dark:border-emerald-900/30' : 'bg-slate-200 dark:bg-navy-700 text-slate-500 border border-slate-200 dark:border-navy-700'}`}>
                      {key.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <div className="mt-8 Card p-6" style={{ border: '1px solid', borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-3 mb-4">
            <Banknote className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">How it works</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your API key is used as a Bearer token against{' '}
            <code className="font-mono text-xs bg-slate-100 dark:bg-navy-800 px-1.5 py-0.5 rounded">
              https://api.surplusintelligence.ai/v1
            </code>
            . The secret is shown only once when created — copy it now or rotate the key later.
          </p>
        </div>
      </div>

      {/* Create key dialog */}
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center',
          openCreate ? '' : 'hidden',
        )}
      >
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpenCreate(false)} />
        <div className="relative bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-navy-700 shadow-2xl mx-4 md:mx-10 my-4 md:my-0 max-w-md z-50">
          <div className="p-6 border-b border-slate-100 dark:border-navy-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create API key</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Create a new key to authenticate your requests to the marketplace API.
            </p>
          </div>
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-tighter">Key name</label>
              <Input
                placeholder="e.g. Production app"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-tighter">Spend limit (USD/month, optional)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 100.00"
                value={createSpend}
                onChange={(e) => setCreateSpend(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-4">
              <Button variant="outline" type="button" onClick={() => setOpenCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create key'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Show secret dialog */}
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center',
          showSecret !== null ? '' : 'hidden',
        )}
      >
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSecret(null)} />
        <div className="relative bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-navy-700 shadow-2xl mx-4 md:mx-10 my-4 md:my-0 max-w-md z-50">
          <div className="p-6 border-b border-slate-100 dark:border-navy-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your new API key</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Copy this key now. It will not be shown again.</p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-100 dark:bg-navy-800 border border-slate-200 dark:border-navy-700 mb-4">
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">sk_live_</span>
              <span className="text-xs font-mono text-slate-900 dark:text-white select-all">{secretValue}</span>
              <Button variant="ghost" size="icon" onClick={() => {
                navigator.clipboard.writeText('sk_live_' + secretValue);
              }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Treat this like a password. Never commit it to version control. Store it in an environment variable.
            </p>
          </div>
          <div className="p-6 border-t border-slate-100 dark:border-navy-700">
            <Button onClick={() => setShowSecret(null)} className="w-full">
              I've saved my key
            </Button>
          </div>
        </div>
      </div>

      {/* Revoke dialog */}
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center',
          openRevoke !== null ? '' : 'hidden',
        )}
      >
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpenRevoke(null)} />
        <div className="relative bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-navy-700 shadow-2xl mx-4 md:mx-10 my-4 md:my-0 max-w-md z-50">
          <div className="p-6 border-b border-slate-100 dark:border-navy-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Revoke API key?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              This action cannot be undone. Any application using this key will stop working immediately.
            </p>
          </div>
          <div className="p-6 flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setOpenRevoke(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => {
              if (openRevoke) handleRevoke(openRevoke);
            }}>
              Revoke key
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
