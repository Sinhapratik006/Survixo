import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Navbar } from '@/components/layout/PublicLayout';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage, SignupPage, safeRedirect } from '@/features/auth/AuthPages';
import { mockApi, PUBLIC_CONFIG, renderPage, renderRoutes, SIGNED_IN, SIGNED_OUT } from './test-utils';

describe('public navigation', () => {
  it('shows primary links and the Start building CTA when signed out', async () => {
    mockApi({ '/api/auth/me': SIGNED_OUT, '/api/config/public': PUBLIC_CONFIG });
    renderPage(<Navbar />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Models', 'How it works', 'Analytics', 'Documentation', 'Pricing']) expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /start building/i })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('opens and closes the mobile menu with an accessible toggle', async () => {
    mockApi({ '/api/auth/me': SIGNED_OUT, '/api/config/public': PUBLIC_CONFIG });
    renderPage(<Navbar />);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    expect(within(mobile).getByRole('link', { name: 'Models' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('navigation', { name: 'Mobile' })).not.toBeInTheDocument();
  });

  it('shows a Dashboard link when signed in', async () => {
    mockApi({ '/api/auth/me': SIGNED_IN, '/api/config/public': PUBLIC_CONFIG });
    renderPage(<Navbar />);
    expect((await screen.findAllByRole('link', { name: 'Dashboard' }))[0]).toHaveAttribute('href', '/dashboard');
  });
});

describe('route protection', () => {
  it('redirects unauthenticated users to login with a return path', async () => {
    mockApi({ '/api/auth/me': SIGNED_OUT, '/api/config/public': PUBLIC_CONFIG });
    renderRoutes(
      [
        { element: <RequireAuth />, children: [{ path: '/dashboard/usage', element: <p>secret usage</p> }] },
        { path: '/login', element: <LoginPage /> },
      ],
      '/dashboard/usage',
    );
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('secret usage')).not.toBeInTheDocument();
  });

  it('renders protected content for signed-in users', async () => {
    mockApi({ '/api/auth/me': SIGNED_IN, '/api/config/public': PUBLIC_CONFIG });
    renderRoutes([{ element: <RequireAuth />, children: [{ path: '/dashboard', element: <p>welcome back</p> }] }], '/dashboard');
    expect(await screen.findByText('welcome back')).toBeInTheDocument();
  });
});

describe('dashboard layout', () => {
  it('opens the mobile navigation drawer and shows the org switcher', async () => {
    mockApi({ '/api/auth/me': SIGNED_IN, '/api/config/public': PUBLIC_CONFIG, '/api/alerts': { data: [], unread: 2 } });
    renderRoutes([{ path: '/dashboard', element: <DashboardLayout />, children: [{ index: true, element: <p>home</p> }] }], '/dashboard');
    expect(await screen.findByRole('combobox', { name: 'Active organization' })).toHaveValue('org1');
    expect(await screen.findByRole('link', { name: 'Alerts (2 unread)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = screen.getByRole('dialog', { name: 'Dashboard navigation' });
    expect(within(drawer).getByRole('link', { name: 'API keys' })).toHaveAttribute('href', '/dashboard/api-keys');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close navigation' }));
    expect(screen.queryByRole('dialog', { name: 'Dashboard navigation' })).not.toBeInTheDocument();
  });
});

describe('authentication pages', () => {
  it('validates the login form before submitting', async () => {
    const api = mockApi({ '/api/auth/me': SIGNED_OUT, '/api/config/public': PUBLIC_CONFIG });
    renderPage(<LoginPage />, '/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(api.mock.calls.some(([url]) => String(url).includes('/api/auth/login'))).toBe(false);
  });

  it('shows the server error for wrong credentials', async () => {
    mockApi({
      '/api/auth/me': SIGNED_OUT,
      '/api/config/public': PUBLIC_CONFIG,
      'POST /api/auth/login': () => new Response(JSON.stringify({ error: { code: 'invalid_credentials', message: 'Incorrect email or password.' } }), { status: 401 }),
    });
    renderPage(<LoginPage />, '/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'dev@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('disables Google sign-in with an explanation when it is not configured', async () => {
    mockApi({ '/api/auth/me': SIGNED_OUT, '/api/config/public': PUBLIC_CONFIG });
    renderPage(<LoginPage />, '/login');
    expect(await screen.findByText(/isn't configured on this server/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled());
  });

  it('links Google sign-in to the OAuth start endpoint with a safe redirect when configured', async () => {
    mockApi({ '/api/auth/me': SIGNED_OUT, '/api/config/public': { ...PUBLIC_CONFIG, googleAuthEnabled: true } });
    renderPage(<LoginPage />, '/login?redirect=%2Fdashboard%2Fbilling');
    const link = await screen.findByRole('link', { name: /continue with google/i });
    expect(link).toHaveAttribute('href', '/api/auth/google/start?redirect=%2Fdashboard%2Fbilling');
  });

  it('maps OAuth callback errors to readable messages', async () => {
    mockApi({ '/api/auth/me': SIGNED_OUT, '/api/config/public': PUBLIC_CONFIG });
    renderPage(<LoginPage />, '/login?error=google_state_mismatch');
    expect(await screen.findByText(/expired or was tampered with/)).toBeInTheDocument();
  });

  it('enforces the password length on sign-up', async () => {
    mockApi({ '/api/auth/me': SIGNED_OUT, '/api/config/public': PUBLIC_CONFIG });
    renderPage(<SignupPage />, '/signup');
    await userEvent.type(await screen.findByLabelText('Name'), 'Dev');
    await userEvent.type(screen.getByLabelText('Work email'), 'dev@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Use at least 10 characters')).toBeInTheDocument();
  });

  it('only accepts same-site relative redirect targets', () => {
    expect(safeRedirect('/dashboard/usage')).toBe('/dashboard/usage');
    expect(safeRedirect('//evil.com')).toBe('/dashboard');
    expect(safeRedirect('https://evil.com')).toBe('/dashboard');
    expect(safeRedirect(null)).toBe('/dashboard');
  });
});
