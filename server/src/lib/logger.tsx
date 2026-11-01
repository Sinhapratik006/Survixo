import pino from 'pino';
import { env } from '../config/env.js';

// Paths that may carry secrets. pino replaces them with "[REDACTED]".
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["stripe-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.token',
  '*.key',
  '*.credential',
  '*.messages',
  '*.prompt',
];

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'nexovra-api' },
});
