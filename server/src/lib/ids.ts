import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Unbiased base62 string from a CSPRNG. */
export function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (const b of bytes) {
      if (b < 248) out += ALPHABET[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export function requestId(): string {
  return `req_${randomBase62(24)}`;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  );
}
