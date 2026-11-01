import type { NextFunction, Request, Response } from 'express';
import { store } from '../lib/store.js';
import { tooManyRequests } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export interface RateLimitOptions {
  name: string;
  windowSeconds: number;
  max: number | ((req: Request) => number);
  key: (req: Request) => string | null;
}

/** Fixed-window rate limiter backed by Redis (or the in-memory dev store). */
export function rateLimit(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = opts.key(req);
    if (!id) return next();
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const max = typeof opts.max === 'function' ? opts.max(req) : opts.max;
    let count: number;
    try {
      count = await store.incr(`rl:${opts.name}:${id}:${window}`, opts.windowSeconds + 5);
    } catch (err) {
      // Fail open on store outage so the API stays available; log loudly.
      logger.error({ err, limiter: opts.name }, 'rate limiter store unavailable');
      return next();
    }
    const reset = (window + 1) * opts.windowSeconds - Math.floor(Date.now() / 1000);
    const remaining = Math.max(0, max - count);
    // With stacked limiters, report the most restrictive one.
    const existing = res.getHeader('RateLimit-Remaining');
    if (existing === undefined || remaining < Number(existing)) {
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(reset));
    }
    if (count > max) {
      res.setHeader('Retry-After', String(reset));
      return next(tooManyRequests(`Rate limit exceeded (${opts.name}). Retry in ${reset}s.`, { limit: max, window_seconds: opts.windowSeconds }));
    }
    next();
  };
}

export const ipKey = (req: Request) => req.ip ?? 'unknown';
export const userKey = (req: Request) => req.auth?.user.id ?? null;
