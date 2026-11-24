import type { Request } from 'express';
import ipaddr from 'ipaddr.js';

/**
 * Best-effort address of the end user, used to key per-IP rate limits and to
 * record where a session was created.
 *
 * In production every request reaches Node through at least one proxy
 * (Render's edge, and Vercel's rewrite when the site proxies /api), so the
 * socket address is the proxy's: with `req.ip` alone every visitor shared a
 * single rate-limit bucket and the whole site returned 429 once combined
 * traffic passed the limit. Both Render and Vercel put the original client
 * first in X-Forwarded-For, so that entry is used when it is a public address.
 *
 * The header is client-influenced when the API is called directly, so a
 * determined caller can pick their own bucket; abuse-sensitive limits are also
 * keyed by user id or email (api-user, login-email), which this cannot bypass.
 */
export function clientIp(req: Request): string | null {
  const header = req.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (raw) {
    const first = normalize(raw.split(',')[0]);
    if (first && isPublic(first)) return first;
  }
  return normalize(req.ip ?? '') ?? req.ip ?? null;
}

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  // "[::1]:1234" or "1.2.3.4:1234"
  if (v.startsWith('[')) v = v.slice(1, v.indexOf(']') > 0 ? v.indexOf(']') : undefined);
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(':'));
  if (!ipaddr.isValid(v)) return null;
  const parsed = ipaddr.parse(v);
  // Fold IPv4-mapped IPv6 (::ffff:1.2.3.4) to plain IPv4 so one client = one key.
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    return (parsed as ipaddr.IPv6).toIPv4Address().toString();
  }
  return parsed.toString();
}

// Addresses that belong to proxies/infrastructure, never to an end user.
const INTERNAL_RANGES = new Set([
  'unspecified',
  'broadcast',
  'multicast',
  'linkLocal',
  'loopback',
  'private',
  'uniqueLocal',
  'carrierGradeNat',
  'ipv4Mapped',
]);

function isPublic(ip: string): boolean {
  return !INTERNAL_RANGES.has(ipaddr.parse(ip).range());
}
