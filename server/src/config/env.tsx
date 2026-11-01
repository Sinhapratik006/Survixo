import 'dotenv/config';
import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8787),
    APP_URL: z.string().url().default('http://localhost:5173'),
    API_PUBLIC_URL: z.string().url().optional(),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().optional(),
    TRUST_PROXY: bool(false),

    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    API_KEY_PEPPER: z.string().min(32, 'API_KEY_PEPPER must be at least 32 characters'),
    ENCRYPTION_MASTER_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_MASTER_KEY must be 32 bytes, base64-encoded'),
    ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),

    DEMO_MODE: bool(true),
    BILLING_MODE: z.enum(['demo', 'stripe']).default('demo'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(500),
    SIGNUP_DEMO_CREDIT_USD: z.coerce.number().min(0).max(100).default(5),

    ALLOW_INSECURE_ENDPOINTS: bool(false),
    PRIVATE_ENDPOINT_ALLOWLIST: csv,
    ADMIN_EMAILS: csv,

    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(10),
    RUN_WORKERS: bool(true),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production') {
      if (v.BILLING_MODE === 'demo')
        ctx.addIssue({ code: 'custom', path: ['BILLING_MODE'], message: 'Demo billing cannot run in production' });
      if (v.DEMO_MODE)
        ctx.addIssue({ code: 'custom', path: ['DEMO_MODE'], message: 'DEMO_MODE must be false in production' });
      if (!v.REDIS_URL)
        ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'REDIS_URL is required in production' });
      if (v.ALLOW_INSECURE_ENDPOINTS)
        ctx.addIssue({ code: 'custom', path: ['ALLOW_INSECURE_ENDPOINTS'], message: 'Insecure endpoints are not allowed in production' });
    }
    if (v.BILLING_MODE === 'stripe' && (!v.STRIPE_SECRET_KEY || !v.STRIPE_WEBHOOK_SECRET))
      ctx.addIssue({ code: 'custom', path: ['STRIPE_SECRET_KEY'], message: 'Stripe billing requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET' });
    if (Boolean(v.GOOGLE_CLIENT_ID) !== Boolean(v.GOOGLE_CLIENT_SECRET))
      ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither' });
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${lines}\nSee .env.example.`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  apiPublicUrl: parsed.data.API_PUBLIC_URL ?? parsed.data.APP_URL,
  googleEnabled: Boolean(parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET),
  googleRedirectUri:
    parsed.data.GOOGLE_REDIRECT_URI ?? `${parsed.data.APP_URL.replace(/\/$/, '')}/api/auth/google/callback`,
};

export type Env = typeof env;
