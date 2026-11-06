import Link from 'next/link';
import { useState } from 'react';
import Button from '../components/Button';
import Input from '../components/Input';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup', { email, password, name });
      window.location.href = '/app/keys';
    } catch (err) {
      setError(err.message || 'Unable to create account.');
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
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create your account</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Start building with Nexovra today
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/10 text-sm text-rose-700 dark:text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Full name"
              placeholder="Jane Doe"
              leftIcon={<User className="w-4 h-4" />}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-2"
            />
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
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                defaultChecked
                className="mt-1 rounded border-slate-300 dark:border-navy-600 text-slate-600 focus:ring-brand-500"
              />
              <label htmlFor="terms" className="text-sm text-slate-600 dark:text-slate-300 leading-none">
                I agree to the{' '}
                <Link href="/legal" className="text-slate-600 dark:text-slate-300 font-medium hover:underline transition-colors">
                  Terms of Service
                </Link>
              </label>
            </div>
            <Button type="submit" className="w-full py-3 text-base mt-2" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'} <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <p className="mt-10 text-center text-sm text-slate-600 dark:text-slate-300">
            Already have an account?{' '}
            <Link href="/login" className="text-slate-600 dark:text-slate-300 font-medium hover:underline transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
