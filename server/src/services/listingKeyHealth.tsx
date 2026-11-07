/**
 * Health checks for marketplace API keys.
 *
 * The listing form accepts arbitrary text in the API key field, so before a
 * listing (or a key rotation) is accepted the key is probed live against the
 * provider: it must authenticate on `GET /models` and, when the seller
 * declared models, it must actually serve at least one of them. A pasted
 * placeholder, truncated key or revoked credential is rejected here instead
 * of being sold to a buyer.
 *
 * All outbound requests go through `safeFetch`, which validates the target
 * URL and refuses private/loopback/metadata addresses (SSRF-safe) and never
 * follows redirects.
 */

import { deadline, readCapped, safeFetch, SsrfError } from '../security/ssrf.js';

export interface ProviderProbe {
  /** Human-readable provider name, used in messages. */
  name: string;
  /** OpenAI-compatible base URL (the service appends `/models`). */
  baseUrl: string;
  /**
   * Relative path of an endpoint that only answers to a valid credential
   * (200) and rejects garbage with 401/403. Required when the provider
   * publishes its model list without authentication — otherwise any pasted
   * string would "pass" the health check against the public list.
   */
  authPath?: string;
}

/** Providers tried when the seller does not tell us where the key belongs. */
export const DEFAULT_PROVIDER_PROBES: ProviderProbe[] = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  // OpenRouter's /models is public (it answers without any credential), so the
  // key itself is confirmed on /key first. Note the host is openrouter.ai —
  // api.openrouter.ai does not resolve.
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', authPath: '/key' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { name: 'Together', baseUrl: 'https://api.together.xyz/v1' },
  { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { name: 'xAI', baseUrl: 'https://api.x.ai/v1' },
  { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
];

const PROBE_TIMEOUT_MS = 8_000;
// OpenRouter's model list alone is ~800KB, so the cap must fit a full
// catalogue; responses are still bounded and time-limited per probe.
const MAX_RESPONSE_BYTES = 1024 * 1024;
const SAMPLE_MODELS = 5;
/** Short keys are practically never real credentials (OpenAI alone is 51 chars). */
const MIN_KEY_LENGTH = 12;
/**
 * Differential control probe: the seller's key already got a 200, so the same
 * request is repeated with this deliberately invalid key. If the endpoint also
 * accepts the invalid key it discriminates nothing (public model lists,
 * presence-only auth) and its 200 cannot vouch for the seller's credential.
 */
const CONTROL_KEY = 'nx-keycheck-control-invalid-key';
const CONTROL_REASON = 'accepted a different invalid key — this endpoint does not validate keys';

export interface KeyFormatResult {
  ok: boolean;
  reason: string | null;
}

const PLACEHOLDER_KEY =
  /^(test|testing|fake|dummy|sample|example|placeholder|changeme|your[_-]?api[_-]?key|api[_-]?key|secret|key|xxx+|yyy+|zzz+|abc+|123+|sk-\.\.\.|\.+)$/i;

/**
 * Cheap structural check that runs before any network call: rejects empty
 * values, pasted whitespace/newlines, non-key characters and obvious
 * placeholders so we never even probe garbage.
 */
export function inspectKeyFormat(raw: string): KeyFormatResult {
  const key = (raw ?? '').trim();
  if (!key) return { ok: false, reason: 'An API key is required.' };
  if (key.includes('...'))
    return { ok: false, reason: 'Paste the full key — "..." placeholders are not accepted.' };
  if (key.length < MIN_KEY_LENGTH)
    return { ok: false, reason: `That is only ${key.length} characters — it does not look like an API key.` };
  if (/\s/.test(key))
    return { ok: false, reason: 'API keys cannot contain spaces or line breaks — check for a stray space or newline.' };
  if (!/^[A-Za-z0-9_\-./+=:]+$/.test(key))
    return { ok: false, reason: 'API keys only contain letters, numbers and a few symbols (- _ . / + = :).' };
  if (PLACEHOLDER_KEY.test(key))
    return { ok: false, reason: 'That looks like a placeholder, not a real API key.' };
  return { ok: true, reason: null };
}

export interface KeyHealthResult {
  ok: boolean;
  /** Provider the key was verified against, when it passed. */
  provider: string | null;
  baseUrl: string | null;
  modelCount: number;
  /** Full list of models the verified key serves (used to pre-fill listing forms). */
  models: string[];
  sampleModels: string[];
  detail: string;
}

interface ProbeOutcome {
  name: string;
  baseUrl: string;
  ok: boolean;
  models: string[];
  /** HTTP status when the provider answered with an error. */
  status?: number;
  error?: string;
}

/** Accepts OpenAI `{data:[{id}]}` and Gemini-style `{models:[{name}]}` shapes. */
function parseModelIds(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as Record<string, unknown>;
  const list = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.models) ? obj.models : null;
  if (!list) return [];
  const ids: string[] = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      if (entry) ids.push(entry);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const id = typeof e.id === 'string' ? e.id : typeof e.name === 'string' ? e.name : null;
      if (id) ids.push(id.replace(/^models\//, ''));
    }
  }
  return ids;
}

function describeError(err: unknown): string {
  if (err instanceof SsrfError) return err.message;
  if (err instanceof Error && err.name === 'AbortError') return 'the request timed out';
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Both key styles: OpenAI-compatible gateways use Bearer, Anthropic uses
 * x-api-key. The `anthropic-version` header is scoped to Anthropic hosts:
 * Anthropic requires it, while other gateways misbehave when handed foreign
 * headers — NVIDIA's catalogue answers an `anthropic-version` request with an
 * empty model list, which would fail the check for the wrong reason.
 */
export function probeHeaders(apiKey: string, baseUrl?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'nexovra-keycheck/0.1',
    authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
  };
  if (baseUrl && isAnthropicHost(baseUrl)) headers['anthropic-version'] = '2023-06-01';
  return headers;
}

function isAnthropicHost(raw: string): boolean {
  try {
    return /(^|\.)anthropic\.com$/i.test(new URL(raw).host);
  } catch {
    return false;
  }
}

/**
 * True when the endpoint answers 2xx to a *different, invalid* key — i.e. it
 * does not validate credentials and must not be allowed to vouch for the
 * seller's key. Trouble reaching the control URL is inconclusive and lets the
 * keyed probe's result stand (a public list responds to the control too, so
 * this cannot mask the case the control exists for).
 */
async function acceptsInvalidKey(url: string): Promise<boolean> {
  const { signal, clear } = deadline(PROBE_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, {
      method: 'GET',
      headers: probeHeaders(CONTROL_KEY, url),
      signal,
    });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  } finally {
    clear();
  }
}

async function probeProvider(probe: ProviderProbe, apiKey: string): Promise<ProbeOutcome> {
  const base = probe.baseUrl.replace(/\/+$/, '');
  const headers = probeHeaders(apiKey, base);

  // Providers with a public /models list are authenticated here first: a 200
  // from the public list must never stand in for a working credential.
  if (probe.authPath) {
    const { signal, clear } = deadline(PROBE_TIMEOUT_MS);
    try {
      const res = await safeFetch(`${base}${probe.authPath}`, {
        method: 'GET',
        headers,
        signal,
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 401 || res.status === 403) {
        return { name: probe.name, baseUrl: base, ok: false, models: [], status: res.status };
      }
      if (!res.ok) {
        return { name: probe.name, baseUrl: base, ok: false, models: [], error: `the provider answered HTTP ${res.status}` };
      }
    } catch (err) {
      return { name: probe.name, baseUrl: base, ok: false, models: [], error: describeError(err) };
    } finally {
      clear();
    }
    // The auth path itself must demand credentials — an auth path anyone can
    // call vouches for nothing.
    if (await acceptsInvalidKey(`${base}${probe.authPath}`)) {
      return { name: probe.name, baseUrl: base, ok: false, models: [], error: CONTROL_REASON };
    }
  }

  // Most sellers paste the origin (`https://api.openai.com`), so retry the
  // conventional `/v1` prefix when the bare path does not exist.
  const candidates = [`${base}/models`];
  if (!/\/v\d+$/i.test(base)) candidates.push(`${base}/v1/models`);

  let lastError = 'no response';
  for (const url of candidates) {
    const { signal, clear } = deadline(PROBE_TIMEOUT_MS);
    try {
      const res = await safeFetch(url, {
        method: 'GET',
        headers,
        signal,
      });
      if (res.status === 401 || res.status === 403) {
        await res.body?.cancel().catch(() => undefined);
        return { name: probe.name, baseUrl: base, ok: false, models: [], status: res.status };
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        lastError = `the provider answered HTTP ${res.status}`;
        continue;
      }
      const text = await readCapped(res, MAX_RESPONSE_BYTES);
      const ids = parseModelIds(text);
      if (ids.length) {
        // When there is no auth path, this list is the only evidence the key
        // is live — so prove the endpoint actually checks keys first. With an
        // auth path the credential was already proven there (and controlling
        // it), and a public catalogue is expected.
        if (!probe.authPath && (await acceptsInvalidKey(url))) {
          lastError = CONTROL_REASON;
          continue;
        }
        return { name: probe.name, baseUrl: base, ok: true, models: ids };
      }
      lastError = 'the provider returned an empty model list';
    } catch (err) {
      lastError = describeError(err);
    } finally {
      clear();
    }
  }
  return { name: probe.name, baseUrl: base, ok: false, models: [], error: lastError };
}

function hostOf(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return raw;
  }
}

function modelListSample(models: string[]): string {
  const sample = models.slice(0, SAMPLE_MODELS).join(', ');
  return models.length > SAMPLE_MODELS ? `${sample}, …` : sample;
}

/**
 * Verify that a pasted key is a live credential. With `baseUrl` the key must
 * authenticate against exactly that endpoint; without it the well-known
 * providers are tried until one accepts the key.
 */
export async function checkListingKey({
  apiKey,
  baseUrl,
  models,
  probes,
}: {
  apiKey: string;
  baseUrl?: string | undefined;
  models?: string[] | undefined;
  probes?: ProviderProbe[] | undefined;
}): Promise<KeyHealthResult> {
  const format = inspectKeyFormat(apiKey);
  if (!format.ok) {
    return { ok: false, provider: null, baseUrl: null, modelCount: 0, models: [], sampleModels: [], detail: format.reason! };
  }

  const key = apiKey.trim();
  const declared = (models ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean);
  const targets: ProviderProbe[] = baseUrl
    ? [{ name: hostOf(baseUrl), baseUrl: baseUrl.replace(/\/+$/, '') }]
    : (probes ?? DEFAULT_PROVIDER_PROBES);

  const outcomes = await Promise.all(targets.map((t) => probeProvider(t, key)));
  const passed = outcomes.find((o) => o.ok);

  if (!passed) {
    const detail = baseUrl
      ? firstTargetFailure(outcomes[0]!, baseUrl)
      : `We could not verify this key against any supported provider. ${summarizeFailures(outcomes)}. Set the API base URL your key belongs to, or check the key and try again.`;
    return { ok: false, provider: null, baseUrl: null, modelCount: 0, models: [], sampleModels: [], detail };
  }

  const sample = passed.models.slice(0, SAMPLE_MODELS);
  const verified = {
    provider: passed.name,
    baseUrl: passed.baseUrl,
    modelCount: passed.models.length,
    models: passed.models,
    sampleModels: sample,
  };

  if (declared.length) {
    const served = passed.models.map((m) => m.toLowerCase());
    const matched = declared.filter((d) => served.some((id) => id === d || id.includes(d) || d.includes(id)));
    if (!matched.length) {
      return {
        ok: false,
        ...verified,
        detail: `The key works, but it does not serve any of the models you listed (${declared
          .slice(0, SAMPLE_MODELS)
          .join(', ')}). It serves: ${modelListSample(passed.models)}.`,
      };
    }
  }

  return {
    ok: true,
    ...verified,
    detail: `Verified against ${passed.name} — ${passed.models.length} model(s) available.`,
  };
}

function firstTargetFailure(outcome: ProbeOutcome, rawBaseUrl: string): string {
  const host = hostOf(rawBaseUrl);
  if (outcome.status === 401 || outcome.status === 403)
    return `The provider at ${host} rejected this key (HTTP ${outcome.status}). Check that the key is active and has credits.`;
  if (outcome.error === CONTROL_REASON)
    return `The endpoint at ${host} also accepted a different invalid key, so it does not validate credentials and cannot verify this one. Set the base URL to an API that requires valid keys.`;
  if (outcome.error === 'the request timed out')
    return `Timed out reaching ${host} — could not verify the key. Check the API base URL and try again.`;
  return `Could not verify the key at ${host}: ${outcome.error ?? 'no response'}.`;
}

/**
 * Group the default-provider failures so the message answers "which provider,
 * what happened": `OpenAI, Groq: rejected the key (HTTP 401); xAI: …`.
 */
function summarizeFailures(outcomes: ProbeOutcome[]): string {
  const groups = new Map<string, string[]>();
  for (const o of outcomes) {
    const reason =
      o.status !== undefined ? `rejected the key (HTTP ${o.status})` : (o.error ?? 'no response');
    const names = groups.get(reason);
    if (names) names.push(o.name);
    else groups.set(reason, [o.name]);
  }
  return [...groups.entries()].map(([reason, names]) => `${names.join(', ')}: ${reason}`).join('; ');
}
