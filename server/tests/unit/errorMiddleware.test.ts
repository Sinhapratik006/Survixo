/**
 * The error handler is what the frontend reads `err.message` from, so the
 * distinction between "retry later" (DB connectivity) and a genuine 500 is
 * user-visible: sellers must see an actionable message, never a mystery
 * error, when the database briefly drops.
 */
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { errorHandler } from '../../src/middleware/error.js';
import { badRequest } from '../../src/lib/errors.js';

function run(err: unknown) {
  const req = { originalUrl: '/api/marketplace/listings', path: '/api/marketplace/listings' };
  const res = {
    headersSent: false,
    status: vi.fn(() => res),
    json: vi.fn(),
  };
  errorHandler(err, req as never, res as never, vi.fn());
  return res;
}

describe('errorHandler', () => {
  it('answers 503 with a retryable message when the database is unreachable', () => {
    const err = new Prisma.PrismaClientInitializationError(
      "Can't reach database server at `db.example.com:5432`",
      '6.19.3',
    );
    const res = run(err);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'service_unavailable',
        message: 'The service is temporarily unable to reach the database. Please try again in a moment.',
      },
    });
  });

  it('answers 503 for pool exhaustion and connect timeouts too', () => {
    for (const code of ['P1001', 'P1002', 'P1009', 'P2024']) {
      const res = run(new Prisma.PrismaClientKnownRequestError('timed out', { code, clientVersion: '6.19.3' }));
      expect(res.status).toHaveBeenCalledWith(503);
    }
    // Application-level Prisma errors (e.g. unique constraint) are not
    // connectivity problems and must stay 500s.
    const constraint = run(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6.19.3' }));
    expect(constraint.status).toHaveBeenCalledWith(500);
    expect(constraint.json).toHaveBeenCalledWith({
      error: { code: 'internal_error', message: 'An unexpected error occurred.' },
    });
  });

  it('keeps HttpErrors untouched', () => {
    const res = run(badRequest('title: Required', undefined, 'validation_error'));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'validation_error', message: 'title: Required' },
    });
  });

  it('falls back to the generic 500 for unknown errors', () => {
    const res = run(new Error('boom'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'internal_error', message: 'An unexpected error occurred.' },
    });
  });
});
