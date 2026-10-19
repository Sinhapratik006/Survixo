/**
 * Browser API client for the Nexovra dashboard API (`/api/*`).
 * - Sends the session cookie (same origin) and the double-submit CSRF header.
 * - Sends the active organization as `X-Org-Id`; the server verifies membership.
 * - Never handles provider secrets: inference credentials stay server-side.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const ORG_KEY = 'nx_active_org';
let activeOrgId: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(ORG_KEY) : null;

export function getActiveOrgId() {
  return activeOrgId;
}

export function setActiveOrgId(id: string | null) {
  activeOrgId = id;
  if (typeof localStorage === 'undefined') return;
  if (id) localStorage.setItem(ORG_KEY, id);
  else localStorage.removeItem(ORG_KEY);
}

export function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const m = document.cookie.match(/(?:^|;\s*)nx_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : undefined;
}

export function apiHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json' };
  if (json) h['content-type'] = 'application/json';
  const csrf = csrfToken();
  if (csrf) h['x-csrf-token'] = csrf;
  if (activeOrgId) h['x-org-id'] = activeOrgId;
  return h;
}

export async function parseError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = `Request failed (${res.status})`;
  let details: unknown;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, code, message, details);
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | null | undefined>;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let url = path;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += `${url.includes('?') ? '&' : '?'}${s}`;
  }
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: apiHeaders(opts.body !== undefined),
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body: body ?? {} }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body: body ?? {} }),
  delete: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('DELETE', path, { ...opts, body }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
