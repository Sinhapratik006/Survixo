import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Small key/value abstraction used for rate limits, short-lived caches and
 * concurrency counters. Uses Redis when REDIS_URL is set. The in-memory
 * fallback is for single-process local development only: counters are not
 * shared between instances and are lost on restart.
 */
export interface KvStore {
  readonly kind: 'redis' | 'memory';
  /** Increment a counter, setting a TTL when the key is created. Returns the new value. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  decr(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

class MemoryStore implements KvStore {
  readonly kind = 'memory' as const;
  private data = new Map<string, { value: string; expiresAt: number }>();

  private live(key: string) {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async incr(key: string, ttlSeconds: number) {
    const entry = this.live(key);
    if (!entry) {
      this.data.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
      return 1;
    }
    const next = Number(entry.value) + 1;
    entry.value = String(next);
    return next;
  }
  async decr(key: string) {
    const entry = this.live(key);
    if (!entry) return 0;
    const next = Math.max(0, Number(entry.value) - 1);
    entry.value = String(next);
    return next;
  }
  async get(key: string) {
    return this.live(key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async del(key: string) {
    this.data.delete(key);
  }
  async ping() {
    return true;
  }
  async close() {
    this.data.clear();
  }
}

class RedisStore implements KvStore {
  readonly kind = 'redis' as const;
  constructor(private client: Redis) {}

  async incr(key: string, ttlSeconds: number) {
    const results = await this.client.multi().incr(key).expire(key, ttlSeconds, 'NX').exec();
    return Number(results?.[0]?.[1] ?? 0);
  }
  async decr(key: string) {
    const value = await this.client.decr(key);
    if (value < 0) await this.client.set(key, '0', 'KEEPTTL');
    return Math.max(0, value);
  }
  async get(key: string) {
    return this.client.get(key);
  }
  async set(key: string, value: string, ttlSeconds: number) {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }
  async del(key: string) {
    await this.client.del(key);
  }
  async ping() {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
  async close() {
    await this.client.quit();
  }
}

function createStore(): KvStore {
  if (env.REDIS_URL) {
    const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false });
    client.on('error', (err) => logger.warn({ err: err.message }, 'redis error'));
    return new RedisStore(client);
  }
  if (!env.isTest) logger.warn('REDIS_URL not set - using in-memory store (single-process development only)');
  return new MemoryStore();
}

export const store: KvStore = createStore();

export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  try {
    const hit = await store.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    /* cache is best-effort */
  }
  const value = await fn();
  try {
    await store.set(key, JSON.stringify(value), ttlSeconds);
  } catch {
    /* ignore */
  }
  return value;
}
