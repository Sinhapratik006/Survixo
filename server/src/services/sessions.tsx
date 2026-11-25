import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { sha256Hex } from '../security/crypto.js';

export const SESSION_COOKIE = 'nx_session';
export const CSRF_COOKIE = 'nx_csrf';

const secureCookies = () => env.isProd || env.APP_URL.startsWith('https://');

import { clientIp } from '../security/clientIp.js';

export { clientIp };

/** Create a new session (fresh token on every sign-in to prevent fixation) and set cookies. */
export async function createSession(res: Response, req: Request, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  const maxAge = env.SESSION_TTL_DAYS * 86_400_000;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256Hex(token),
      csrfTokenHash: sha256Hex(csrf),
      ip: clientIp(req),
      userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + maxAge),
    },
  });
  const domain = env.COOKIE_DOMAIN || undefined;
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', domain, maxAge });
  // Readable by the SPA (double-submit CSRF token); useless to an attacker without the httpOnly session.
  res.cookie(CSRF_COOKIE, csrf, { httpOnly: false, sameSite: 'lax', secure: secureCookies(), path: '/', domain, maxAge });
}

export function clearSessionCookies(res: Response): void {
  const domain = env.COOKIE_DOMAIN || undefined;
  for (const name of [SESSION_COOKIE, CSRF_COOKIE]) {
    res.clearCookie(name, { path: '/', domain });
    // Also drop any host-only copy left from before COOKIE_DOMAIN was set.
    if (domain) res.clearCookie(name, { path: '/' });
  }
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const r = await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
  return r.count;
}
