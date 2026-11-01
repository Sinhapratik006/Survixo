import { hmacHex, safeEqual } from './crypto.js';

export const SIGNATURE_HEADER = 'nexovra-signature';
export const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Signature format (header `Nexovra-Signature`):
 *   t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 */
export function signWebhook(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  header: string | undefined | null,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    }),
  ) as Record<string, string | undefined>;
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(now - t) > toleranceSeconds) return false;
  return safeEqual(hmacHex(secret, `${t}.${rawBody}`), v1);
}
