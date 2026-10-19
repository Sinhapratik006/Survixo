import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { HttpError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { InferenceError } from '../services/inference.js';

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw badRequest(
      first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid request',
      result.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
      'validation_error',
    );
  }
  return result.data;
}

function isV1(req: Request) {
  return req.originalUrl.startsWith('/v1/');
}

/** OpenAI-style error envelope used by the /v1 API. */
export function openAiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  const type =
    status === 401 ? 'authentication_error' : status === 402 ? 'insufficient_quota' : status === 429 ? 'rate_limit_error' : status >= 500 ? 'api_error' : 'invalid_request_error';
  return { error: { message, type, code, param: null, ...extra } };
}

export function notFoundHandler(req: Request, res: Response) {
  if (isV1(req)) return res.status(404).json(openAiError(404, 'not_found', `Unknown endpoint ${req.method} ${req.path}`));
  res.status(404).json({ error: { code: 'not_found', message: `Unknown endpoint ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = 'internal_error';
  let message = 'An unexpected error occurred.';
  let details: unknown;

  if (err instanceof HttpError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof InferenceError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = { ...err.details, request_id: err.requestId };
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'validation_error';
    message = err.issues[0]?.message ?? 'Invalid request';
  } else if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    status = 413;
    code = 'payload_too_large';
    message = 'Request body is too large.';
  } else if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    status = 400;
    code = 'invalid_json';
    message = 'Request body is not valid JSON.';
  } else {
    logger.error({ err, path: req.path }, 'unhandled error');
  }

  if (res.headersSent) return;
  if (isV1(req)) return res.status(status).json(openAiError(status, code, message, details ? { details } : undefined));
  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
}
