import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { store } from '../lib/store.js';
import { tooManyRequests } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { clientIp } from './clientIp.js';

/**
 * Brute-force protection for password sign-in.
 *
 * Unlike the plain request limiters, this only counts FAILED attempts, so a
 * user who signs in and out repeatedly is never locked out. A successful login
 * clears the per-email counter. Two independent buckets:
 *
 * - per email: stops guessing one account's password from many IPs
 * - per IP:    stops one IP spraying passwords across many accounts
 *
 * Each bucket expires `AUTH_LOGIN_LOCKOUT_SECONDS` after its first failure.
 */
const WINDOW = () => env.AUTH_LOGIN_LOCKOUT_SECONDS;
const emailKey = (email: string) => `lf:email:${email}`;
const ipKey = (ip: string) => `lf:ip:${ip}`;

async function count(key: string): Promise<number> {
  return Number((await store.get(key)) ?? 0);
}

/** Middleware: reject before checking the password when either bucket is exhausted. */
export function loginThrottle(getEmail: (req: Request) => string | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const email = getEmail(req);
    const ip = clientIp(req) ?? 'unknown';
    try {
      const [byEmail, byIp] = await Promise.all([email ? count(emailKey(email)) : 0, count(ipKey(ip))]);
      if (byEmail >= env.AUTH_LOGIN_MAX_FAILURES_PER_EMAIL || byIp >= env.AUTH_LOGIN_MAX_FAILURES_PER_IP) {
        // The store does not expose TTLs; the full window is a safe upper bound.
        const retry = WINDOW();
        res.setHeader('Retry-After', String(retry));
        return next(
          tooManyRequests(`Too many failed sign-in attempts. Try again in ${Math.ceil(retry / 60)} minutes.`, {
            window_seconds: WINDOW(),
          }),
        );
      }
    } catch (err) {
      // Fail open on store outage, same as the request limiters.
      logger.error({ err }, 'login throttle store unavailable');
    }
    next();
  };
}

export async function recordLoginFailure(req: Request, email: string | null) {
  const ip = clientIp(req) ?? 'unknown';
  try {
    await Promise.all([
      email ? store.incr(emailKey(email), WINDOW()) : Promise.resolve(0),
      store.incr(ipKey(ip), WINDOW()),
    ]);
  } catch (err) {
    logger.error({ err }, 'login throttle store unavailable');
  }
}

export async function recordLoginSuccess(email: string) {
  try {
    await store.del(emailKey(email));
  } catch (err) {
    logger.error({ err }, 'login throttle store unavailable');
  }
}
