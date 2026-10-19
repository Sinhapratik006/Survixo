import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

// Deterministic test configuration. Must run before any server module is imported
// (server/src/config/env.ts validates the environment at import time).
const set = (key: string, value: string) => {
  process.env[key] = value;
};
set('NODE_ENV', 'test');
set('APP_URL', 'http://localhost:5173');
set('SESSION_SECRET', 'test-session-secret-0123456789abcdefghijklmnop');
set('API_KEY_PEPPER', 'test-api-key-pepper-0123456789abcdefghijklmnop');
set('ENCRYPTION_MASTER_KEY', Buffer.alloc(32, 7).toString('base64'));
set('ENCRYPTION_KEY_VERSION', '1');
set('DEMO_MODE', 'true');
set('BILLING_MODE', 'demo');
set('SIGNUP_DEMO_CREDIT_USD', '5');
set('PLATFORM_FEE_BPS', '500');
set('RUN_WORKERS', 'false');
set('AUTH_RATE_LIMIT_PER_MINUTE', '1000');
set('LOG_LEVEL', 'silent');
// Integration tests talk to local mock servers on 127.0.0.1 over plain HTTP.
set('ALLOW_INSECURE_ENDPOINTS', 'true');
set('PRIVATE_ENDPOINT_ALLOWLIST', '127.0.0.1');
set('GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');
set('GOOGLE_CLIENT_SECRET', 'test-client-secret');
delete process.env.REDIS_URL;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

let provided: string | undefined;
try {
  provided = inject('databaseUrl');
} catch {
  provided = undefined;
}
set('DATABASE_URL', provided ?? 'postgresql://unit:unit@127.0.0.1:1/unit_tests_do_not_connect');
