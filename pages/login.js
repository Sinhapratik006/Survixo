import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Button from '../components/Button';
import Input from '../components/Input';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/login', { email, password });
      // Return the user to the page they came from (e.g. /seller/create),
      // but only allow same-origin relative paths so this can't be an open redirect.
      const next = router.query.next;
      const safeNext =
        typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\');
      window.location.href = safeNext ? next : '/app/keys';
    } catch (err) {
      setError(err.message || 'Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-canvas to-white dark:from-navy-950 dark:to-navy-900 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/10 blur-3xl -mt-32 pointer-events-none" />
      <div className="absolute bottom-0 right-1/2 translate-x-1/2 w-[600px] h-[600px] rounded-full bg-purple-500/10 blur-3xl -mb-32 pointer-events-none" />

      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-10">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/30 relative overflow-hidden">
              <span className="text-white font-bold text-sm">N</span>
              <div className="absolute inset-0 bg-white/10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Welcome back</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Sign in to your Nexovra account
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/10 text-sm text-rose-700 dark:text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              leftIcon={<Mail className="w-4 h-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-2"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-6"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input type="checkbox" className="rounded border-slate-300 dark:border-navy-600 text-slate-600 focus:ring-brand-500" />
                Remember me
              </label>
              <a href="#" className="text-sm text-slate-600 dark:text-slate-300 font-medium hover:underline transition-colors">
                Forgot password?
              </a>
            </div>
            <Button type="submit" className="w-full py-3 text-base" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'} <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-600 dark:text-slate-300">
            Don't have an account?{' '}
            <Link href="/signup" className="text-slate-600 dark:text-slate-300 font-medium hover:underline transition-colors">
              Create one
            </Link>
          </p>

          <div className="mt-10 relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200 dark:border-navy-800"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-navy-950 px-3 text-slate-400">Or continue with</span>
            </div>
          </div>
          <div className="mt-6">
            <Button className="w-full py-3 border border-slate-200 dark:border-navy-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800/50 flex items-center justify-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-[10px]">g</span>
              Sign in with Google
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
