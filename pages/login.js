import Link from 'next/link';
import { LogoMark } from '../components/Logo';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Button from '../components/Button';
import Input from '../components/Input';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';
import GoogleSignIn, { googleErrorMessage } from '../components/GoogleSignIn';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Return the user to the page they came from (e.g. /seller/create), but only
  // same-origin relative paths so this can't be an open redirect.
  const next = router.query.next;
  const safeNext =
    typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
      ? next
      : '/marketplace';
  // Set by the Google callback when sign-in fails.
  const shownError = error || googleErrorMessage(router.query.error);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/login', { email, password });
      window.location.href = safeNext;
    } catch (err) {
      setError(err.message || 'Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">

      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-5"><LogoMark size={28} /></div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Welcome back</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Sign in to your ApiTradeX account
            </p>
          </div>

          {shownError && (
            <div role="alert" className="mb-5 p-3 rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/10 text-sm text-rose-700 dark:text-rose-400">
              {shownError}
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

          <GoogleSignIn redirect={safeNext} />

          <p className="mt-8 text-center text-sm text-slate-600 dark:text-slate-300">
            Don't have an account?{' '}
            <Link href="/signup" className="text-slate-600 dark:text-slate-300 font-medium hover:underline transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
