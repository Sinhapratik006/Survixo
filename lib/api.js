/**
 * ApiTradeX frontend API client.
 * Calls the Express backend on the same origin (Next.js dev/proxy or production).
 * Session auth via HttpOnly cookies; OpenAI-compatible /v1 API via Bearer token.
 */

const API_KEY_STORAGE_KEY = 'surplus_api_key';

/** Double-submit CSRF cookie (set readable by the SPA, bound to the session by hash). */
const CSRF_COOKIE = 'nx_csrf';
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getApiKey() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setApiKey(key) {
  if (typeof window === 'undefined') return;
  if (key) localStorage.setItem(API_KEY_STORAGE_KEY, key);
  else localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json') && !ct.includes('text/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function apiFetch(input, opts = {}) {
  const { query, auth = 'session', timeoutMs = 30000, ...rest } = opts;

  let url = input;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      params.append(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  const headers = {};
  if (auth === 'apikey') {
    const key = getApiKey();
    if (key) headers['Authorization'] = 'Bearer ' + key;
  }
  if (rest.body && !(rest.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  Object.assign(headers, rest.headers || {});

  // Cookie-authenticated state-changing requests must echo the CSRF cookie in
  // X-CSRF-Token. The backend skips this for safe methods and for
  // unauthenticated requests (e.g. login), and enforces it otherwise.
  const method = String(rest.method || 'GET').toUpperCase();
  if (auth === 'session' && !SAFE_METHODS.includes(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...rest,
      headers,
      signal: controller.signal,
      credentials: auth === 'session' ? 'include' : 'omit',
    });
    clearTimeout(timeout);

    const data = await parseJson(res);

    if (!res.ok) {
      const err = (data && data.error) || {};
      throw new ApiError(res.status, err.message || 'Request failed with status ' + res.status, err.code, err.details);
    }

    return { data, status: res.status, headers: res.headers };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out', 'timeout');
    }
    throw new ApiError(0, err instanceof Error ? err.message : 'Request failed', 'unknown');
  }
}

/**
 * Format a dollar amount (input in USD) as currency, e.g. $1,234.56
 */
export function formatUsd(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Format a token count with compact suffixes, e.g. 12.4k / 1.2M / 1,234
 */
export function formatTokens(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString();
}

/**
 * Format a percentage value (already multiplied by 100 by the caller), e.g. 24.5%
 */
export function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(1)}%`;
}

export const api = {
  get: (input, opts) => apiFetch(input, { ...opts, method: 'GET' }),
  post: (input, body, opts) =>
    apiFetch(input, { ...opts, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: (input, body, opts) =>
    apiFetch(input, { ...opts, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: (input, opts) => apiFetch(input, { ...opts, method: 'DELETE' }),
};
