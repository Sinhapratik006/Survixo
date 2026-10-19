import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Envelope encryption for secrets at rest (provider credentials, webhook secrets).
 * Each secret gets a fresh random data-encryption key (DEK). The secret is
 * encrypted with the DEK (AES-256-GCM) and the DEK is wrapped with the master
 * key-encryption key (KEK) from ENCRYPTION_MASTER_KEY. In production the KEK
 * should live in a KMS/HSM; the wrap/unwrap functions are the integration point.
 */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  wrappedKey: string;
  keyVersion: number;
}

function masterKey(version: number): Buffer {
  if (version !== env.ENCRYPTION_KEY_VERSION) {
    // Key rotation: add previous keys here (e.g. ENCRYPTION_MASTER_KEY_V1) and select by version.
    throw new Error(`No master key available for version ${version}`);
  }
  return Buffer.from(env.ENCRYPTION_MASTER_KEY, 'base64');
}

function gcmEncrypt(key: Buffer, plaintext: Buffer, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ciphertext, authTag: cipher.getAuthTag() };
}

function gcmDecrypt(key: Buffer, iv: Buffer, ciphertext: Buffer, authTag: Buffer, aad: string) {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** `context` is bound as additional authenticated data so a ciphertext cannot be moved to another record. */
export function encryptSecret(plaintext: string, context: string): EncryptedSecret {
  const version = env.ENCRYPTION_KEY_VERSION;
  const dek = randomBytes(32);
  const data = gcmEncrypt(dek, Buffer.from(plaintext, 'utf8'), context);
  const wrapped = gcmEncrypt(masterKey(version), dek, `dek:${context}`);
  dek.fill(0);
  return {
    ciphertext: data.ciphertext.toString('base64'),
    iv: data.iv.toString('base64'),
    authTag: data.authTag.toString('base64'),
    wrappedKey: [wrapped.iv, wrapped.authTag, wrapped.ciphertext].map((b) => b.toString('base64')).join('.'),
    keyVersion: version,
  };
}

export function decryptSecret(secret: EncryptedSecret, context: string): string {
  const [wIv, wTag, wCt] = secret.wrappedKey.split('.').map((s) => Buffer.from(s, 'base64'));
  if (!wIv || !wTag || !wCt) throw new Error('Malformed wrapped key');
  const dek = gcmDecrypt(masterKey(secret.keyVersion), wIv, wCt, wTag, `dek:${context}`);
  try {
    return gcmDecrypt(
      dek,
      Buffer.from(secret.iv, 'base64'),
      Buffer.from(secret.ciphertext, 'base64'),
      Buffer.from(secret.authTag, 'base64'),
      context,
    ).toString('utf8');
  } finally {
    dek.fill(0);
  }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacHex(secret: string, input: string): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function secretHint(secret: string): string {
  return secret.length <= 8 ? '••••' : `••••${secret.slice(-4)}`;
}
