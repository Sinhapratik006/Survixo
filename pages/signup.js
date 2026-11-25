import Link from 'next/link';
import { LogoMark } from '../components/Logo';
import { useState } from 'react';
import Button from '../components/Button';
import Input from '../components/Input';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';
import GoogleSignIn from '../components/GoogleSignIn';

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
      window.location.href = '/marketplace';
    } catch (err) {
      setError(err.message || 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">

      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-5"><LogoMark size={56} /></div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create your account</h2>
            <p className="text-slate-600 dark:text-slate-300">
              Start building with ApiTradeX today
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

          <GoogleSignIn label="Sign up with Google" />

          <p className="mt-8 text-center text-sm text-slate-600 dark:text-slate-300">
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
