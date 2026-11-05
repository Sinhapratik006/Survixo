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

/** Both key styles: OpenAI-compatible gateways use Bearer, Anthropic uses x-api-key. */
function probeHeaders(apiKey: string): Record<string, string> {
  return {
    accept: 'application/json',
    'user-agent': 'nexovra-keycheck/0.1',
    authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
    // Anthropic rejects /v1/models without a version header even for valid
    // keys; every other provider just ignores the extra header.
    'anthropic-version': '2023-06-01',
  };
}

async function probeProvider(probe: ProviderProbe, apiKey: string): Promise<ProbeOutcome> {
  const base = probe.baseUrl.replace(/\/+$/, '');

  // Providers with a public /models list are authenticated here first: a 200
  // from the public list must never stand in for a working credential.
  if (probe.authPath) {
    const { signal, clear } = deadline(PROBE_TIMEOUT_MS);
    try {
      const res = await safeFetch(`${base}${probe.authPath}`, {
        method: 'GET',
        headers: probeHeaders(apiKey),
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
        headers: probeHeaders(apiKey),
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
      if (ids.length) return { name: probe.name, baseUrl: base, ok: true, models: ids };
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
    return { ok: false, provider: null, baseUrl: null, modelCount: 0, sampleModels: [], detail: format.reason! };
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
    return { ok: false, provider: null, baseUrl: null, modelCount: 0, sampleModels: [], detail };
  }

  const sample = passed.models.slice(0, SAMPLE_MODELS);
  const verified = {
    provider: passed.name,
    baseUrl: passed.baseUrl,
    modelCount: passed.models.length,
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
