import { env } from '../config/env.js';
import { randomBase62 } from '../lib/ids.js';
import { hmacHex } from './crypto.js';

export const API_KEY_PREFIX = 'nxv_';

export interface GeneratedKey {
  plaintext: string;
  hash: string;
  prefix: string;
  last4: string;
}

/**
 * 40 base62 chars ≈ 238 bits of entropy from the OS CSPRNG.
 * Only a keyed HMAC-SHA256 (with a server-side pepper) is stored, so a database
 * leak alone does not allow verifying or recovering keys.
 */
export function generateApiKey(): GeneratedKey {
  const body = randomBase62(40);
  const plaintext = `${API_KEY_PREFIX}${body}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, API_KEY_PREFIX.length + 6),
    last4: plaintext.slice(-4),
  };
}

export function hashApiKey(plaintext: string): string {
  return hmacHex(env.API_KEY_PEPPER, plaintext);
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX) && /^nxv_[0-9A-Za-z]{40}$/.test(value);
}

export function maskKey(prefix: string, last4: string): string {
  return `${prefix}…${last4}`;
}
