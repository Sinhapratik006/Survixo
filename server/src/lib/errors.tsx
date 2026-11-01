export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown, code = 'invalid_request') =>
  new HttpError(400, code, message, details);
export const unauthorized = (message = 'Authentication required', code = 'unauthorized') =>
  new HttpError(401, code, message);
export const forbidden = (message = 'You do not have permission to perform this action', code = 'forbidden') =>
  new HttpError(403, code, message);
export const notFound = (message = 'Not found', code = 'not_found') => new HttpError(404, code, message);
export const conflict = (message: string, code = 'conflict', details?: unknown) =>
  new HttpError(409, code, message, details);
export const paymentRequired = (message: string, code: string, details?: unknown) =>
  new HttpError(402, code, message, details);
export const tooManyRequests = (message = 'Rate limit exceeded', details?: unknown) =>
  new HttpError(429, 'rate_limited', message, details);
