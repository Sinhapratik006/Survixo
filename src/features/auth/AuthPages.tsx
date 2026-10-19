import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Alert, Button, Field, Input, Spinner } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { useConfig } from '@/hooks/useConfig';
import { SESSION_KEY, useSession } from './useSession';

/** Maps OAuth callback error codes (from the server redirect) to human messages. */
export const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured on this server.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_state_mismatch: 'Your sign-in session expired or was tampered with. Please try again.',
  google_email_unverified: 'Your Google account email is not verified.',
  google_nonce_mismatch: 'Google sign-in could not be verified. Please try again.',
  google_token_exchange_failed: 'Google rejected the sign-in request. Please try again.',
  google_already_linked: 'That Google account is already linked to another Nexovra user.',
  account_deleted: 'This account has been deleted.',
  google_error: 'Google sign-in failed. Please try again.',
};

/** Only same-site relative paths are used as post-login destinations. */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/dashboard';
  return value;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ redirect, label = 'Continue with Google', mode = 'login' }: { redirect: string; label?: string; mode?: 'login' | 'link' }) {
  const { data: config, isLoading } = useConfig();
  const enabled = Boolean(config?.googleAuthEnabled);
  const href = `/api/auth/google/start?redirect=${encodeURIComponent(redirect)}${mode === 'link' ? '&mode=link' : ''}`;
  if (isLoading) return <Button variant="outline" className="w-full" disabled loading>{label}</Button>;
  if (!enabled)
    return (
      <div>
        <Button variant="outline" className="w-full" disabled leftIcon={<GoogleIcon />}>
          {label}
        </Button>
        <p className="mt-1.5 text-center text-xs text-muted">Google sign-in isn't configured on this server (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>
      </div>
    );
  // Full-page navigation: the OAuth flow is a top-level redirect to Google.
  return (
    <a
      href={href}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:border-navy-500 dark:bg-transparent dark:text-slate-200 dark:hover:bg-navy-700"
    >
      <GoogleIcon />
      {label}
    </a>
  );
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-4 py-12 sm:px-8">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block">
        <div className="grid-bg absolute inset-0 opacity-40" aria-hidden />
        <div className="relative flex h-full flex-col justify-center px-14 text-slate-200">
          <p className="eyebrow !text-cyan-300">One API · many sellers</p>
          <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight text-white">AI inference, at the price the market discovers.</h2>
          <ul className="mt-8 max-w-md space-y-4 text-sm text-slate-300">
            {[
              'OpenAI-compatible endpoint with explainable routing on every request',
              'Hard budgets enforced server-side before requests are dispatched',
              'Keys are hashed at rest and shown exactly once',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-brand-100 dark:bg-navy-600" />
      or
      <span className="h-px flex-1 bg-brand-100 dark:bg-navy-600" />
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export function LoginPage() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const oauthError = params.get('error');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const { data: config } = useConfig();
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const login = useMutation({
    mutationFn: (v: z.infer<typeof loginSchema>) => api.post('/api/auth/login', v),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      navigate(redirect, { replace: true });
    },
  });
  useEffect(() => {
    document.title = 'Sign in · Nexovra';
  }, []);

  if (session.data?.user) return <Navigate to={redirect} replace />;
  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Use Google or your email and password."
      footer={
        <>
          New to Nexovra?{' '}
          <Link to={`/signup${params.get('redirect') ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            Create an account
          </Link>
        </>
      }
    >
      {oauthError && (
        <Alert tone="danger" className="mb-4">
          {GOOGLE_ERRORS[oauthError] ?? 'Sign-in failed. Please try again.'}
        </Alert>
      )}
      <GoogleButton redirect={redirect} />
      <Divider />
      <form onSubmit={form.handleSubmit((v) => login.mutate(v))} noValidate className="space-y-4">
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(id, aria) => <Input id={id} type="email" autoComplete="email" {...aria} {...form.register('email')} />}
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          {(id, aria) => <Input id={id} type="password" autoComplete="current-password" {...aria} {...form.register('password')} />}
        </Field>
        {login.error && <Alert tone="danger">{errorMessage(login.error)}</Alert>}
        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
      {config?.demoMode && (
        <Alert tone="demo" className="mt-4" title="Demo mode">
          If the seed script was run, you can sign in with <code>demo@nexovra.local</code> / <code>demo-password-123</code>.
        </Alert>
      )}
    </AuthShell>
  );
}

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(10, 'Use at least 10 characters').max(128),
});

export function SignupPage() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const { data: config } = useConfig();
  const form = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema), defaultValues: { name: '', email: '', password: '' } });
  const signup = useMutation({
    mutationFn: (v: z.infer<typeof signupSchema>) => api.post('/api/auth/signup', v),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      navigate(redirect, { replace: true });
    },
  });
  useEffect(() => {
    document.title = 'Create account · Nexovra';
  }, []);

  if (session.isLoading) return <Spinner className="m-8" />;
  if (session.data?.user) return <Navigate to={redirect} replace />;
  return (
    <AuthShell
      title="Create your account"
      subtitle="Get an API key, compare offers and start routing in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton redirect={redirect} label="Sign up with Google" />
      <Divider />
      <form onSubmit={form.handleSubmit((v) => signup.mutate(v))} noValidate className="space-y-4">
        <Field label="Name" error={form.formState.errors.name?.message}>
          {(id, aria) => <Input id={id} autoComplete="name" {...aria} {...form.register('name')} />}
        </Field>
        <Field label="Work email" error={form.formState.errors.email?.message}>
          {(id, aria) => <Input id={id} type="email" autoComplete="email" {...aria} {...form.register('email')} />}
        </Field>
        <Field label="Password" hint="At least 10 characters." error={form.formState.errors.password?.message}>
          {(id, aria) => <Input id={id} type="password" autoComplete="new-password" {...aria} {...form.register('password')} />}
        </Field>
        {signup.error && <Alert tone="danger">{errorMessage(signup.error)}</Alert>}
        <Button type="submit" className="w-full" loading={signup.isPending}>
          Create account
        </Button>
        {config?.billingMode === 'demo' && (
          <p className="text-center text-xs text-muted">This server runs in demo billing mode: new workspaces receive a small demo credit that is not real money.</p>
        )}
        <p className="text-center text-xs text-muted">
          By continuing you agree to the <Link to="/legal/terms" className="underline">Terms</Link> and <Link to="/legal/privacy" className="underline">Privacy policy</Link>.
        </p>
      </form>
    </AuthShell>
  );
}
