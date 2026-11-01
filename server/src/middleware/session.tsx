import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { safeEqual, sha256Hex } from '../security/crypto.js';
import { CSRF_COOKIE, SESSION_COOKIE } from '../services/sessions.js';

const TOUCH_INTERVAL_MS = 5 * 60_000;

/** Loads the session (if any) from the httpOnly cookie. Never fails the request. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token || token.length > 200) return next();
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, avatarUrl: true, emailVerified: true, deletedAt: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.deletedAt) return next();
  const { deletedAt: _d, ...user } = session.user;
  req.auth = { user, sessionId: session.id, csrfTokenHash: session.csrfTokenHash };
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    void prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedOrigins() {
  return new Set([new URL(env.APP_URL).origin, new URL(env.apiPublicUrl).origin]);
}

/**
 * CSRF defence for cookie-authenticated routes:
 *  1. Cross-origin state-changing requests are rejected by Origin check.
 *  2. Authenticated state-changing requests must echo the CSRF cookie in the
 *     X-CSRF-Token header (double submit), bound to the session by hash.
 * SameSite=Lax cookies provide an additional layer.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins().has(origin)) return next(forbidden('Cross-origin request blocked', 'csrf_origin'));
  if (!req.auth) return next();
  const header = req.get('x-csrf-token');
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (!header || !cookie || !safeEqual(header, cookie) || !safeEqual(sha256Hex(header), req.auth.csrfTokenHash)) {
    return next(forbidden('Missing or invalid CSRF token', 'csrf_invalid'));
  }
  next();
}
