import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/app/providers';

type Handler = (url: URL, init?: RequestInit) => unknown;

/** Stub global fetch with a path → JSON handler map. Unknown paths return 404. */
export function mockApi(routes: Record<string, unknown | Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${url.pathname}`;
    const handler = routes[key] ?? routes[url.pathname];
    if (handler === undefined) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not mocked' } }), { status: 404 });
    const body = typeof handler === 'function' ? (handler as Handler)(url, init) : handler;
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const PUBLIC_CONFIG = {
  demoMode: true,
  billingMode: 'demo',
  platformFeeBps: 500,
  googleAuthEnabled: false,
  apiBaseUrl: 'http://localhost:5173/v1',
  adapters: [],
  reliability: { minSamples: 30, windowDays: 7 },
};

export const SIGNED_OUT = { user: null, memberships: [] };

export const SIGNED_IN = {
  user: {
    id: 'u1',
    email: 'dev@example.com',
    name: 'Dev',
    role: 'USER',
    avatarUrl: null,
    emailVerified: true,
    hasPassword: true,
    theme: 'system',
    createdAt: '2026-01-01T00:00:00Z',
    linkedAccounts: [],
  },
  memberships: [{ id: 'org1', name: "Dev's workspace", slug: 'dev', personal: true, role: 'OWNER', permissions: ['keys:manage', 'usage:view'] }],
};

export function renderRoutes(routes: RouteObject[], initialPath: string): ReturnType<typeof render> {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(
    <AppProviders client={createQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

export function renderPage(element: ReactElement, path = '/'): ReturnType<typeof render> {
  return renderRoutes([{ path: '*', element }], path);
}
