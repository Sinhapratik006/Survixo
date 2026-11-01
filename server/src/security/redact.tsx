/**
 * Best-effort redaction of secrets in free text (prompts kept under a
 * retention policy, error messages from upstream providers, etc.).
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/nxv_[0-9A-Za-z]{20,}/g, 'nxv_[REDACTED]'],
  [/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}/g, 'sk-[REDACTED]'],
  [/\bwhsec_[A-Za-z0-9_-]{16,}/g, 'whsec_[REDACTED]'],
  [/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED_GOOGLE_KEY]'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/g, '[REDACTED_SLACK_TOKEN]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]'],
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]'],
  [/((?:api[_-]?key|secret|password|token)["'\s:=]+)[^\s"',]{8,}/gi, '$1[REDACTED]'],
];

export function redactText(input: string): string {
  let out = input;
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactText(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out as T;
  }
  return value;
}

/** Sanitize an upstream/provider error so internals and secrets are not leaked to buyers. */
export function sanitizeUpstreamError(message: string, max = 300): string {
  return redactText(message)
    .replace(/https?:\/\/[^\s"']+/g, '[upstream-url]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '[ip]')
    .slice(0, max);
}
