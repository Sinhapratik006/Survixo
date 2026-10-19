import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError, unauthorized } from '../lib/errors.js';
import { hashApiKey, looksLikeApiKey } from '../security/apiKeys.js';

/** Authenticates `Authorization: Bearer nxv_...` for the /v1 API. */
export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return next(unauthorized('Missing API key. Send "Authorization: Bearer nxv_...".', 'missing_api_key'));
  const plaintext = match[1]!;
  if (!looksLikeApiKey(plaintext)) return next(unauthorized('Invalid API key.', 'invalid_api_key'));

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(plaintext) },
    select: { id: true, orgId: true, projectId: true, spendLimitMicros: true, spentMicros: true, rpmLimit: true, revokedAt: true, expiresAt: true },
  });
  if (!key) return next(unauthorized('Invalid API key.', 'invalid_api_key'));
  if (key.revokedAt) return next(new HttpError(401, 'api_key_revoked', 'This API key has been revoked.'));
  if (key.expiresAt && key.expiresAt < new Date()) return next(new HttpError(401, 'api_key_expired', 'This API key has expired.'));
  const { revokedAt: _r, expiresAt: _e, ...rest } = key;
  req.apiKeyAuth = rest;
  next();
}
