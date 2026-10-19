import express, { Router } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { csrfProtection, loadSession, requireAuth } from './middleware/session.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { rateLimit, ipKey, userKey } from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { apiKeysRouter } from './routes/apiKeys.js';
import { dashboardRouter, usageRouter } from './routes/usage.js';
import { billingRouter, stripeWebhookRouter } from './routes/billing.js';
import { routingRouter } from './routes/routing.js';
import { playgroundRouter } from './routes/playground.js';
import { sellersRouter } from './routes/sellers.js';
import { teamsRouter } from './routes/teams.js';
import { comparisonsRouter, favoritesRouter, settingsRouter } from './routes/settings.js';
import { alertsRouter, webhooksRouter } from './routes/alerts.js';
import { adminRouter } from './routes/admin.js';
import { v1Router } from './routes/v1.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  // Safety net: never crash on BigInt serialization.
  app.set('json replacer', (_k: string, v: unknown) => (typeof v === 'bigint' ? Number(v) : v));

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/healthz' },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  const https = env.APP_URL.startsWith('https://');
  app.use(
    helmet({
      // HSTS and upgrade-insecure-requests only make sense when the app is served over HTTPS.
      strictTransportSecurity: https ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: https ? [] : null,
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'", 'https://accounts.google.com', 'https://checkout.stripe.com'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // Raw-body routes must be mounted before JSON parsing.
  app.use('/api/billing/stripe/webhook', stripeWebhookRouter);

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // ── OpenAI-compatible API (API-key auth, no cookies) ──
  app.use('/v1', v1Router);

  // ── Dashboard/public API (cookie sessions + CSRF) ──
  const api = Router();
  api.use(loadSession, csrfProtection);
  api.use(rateLimit({ name: 'api-ip', windowSeconds: 60, max: 600, key: ipKey }));
  api.use('/auth', authRouter);
  api.use(publicRouter);

  const authed = Router();
  authed.use(requireAuth, rateLimit({ name: 'api-user', windowSeconds: 60, max: 600, key: userKey }));
  authed.use('/dashboard', dashboardRouter);
  authed.use('/api-keys', apiKeysRouter);
  authed.use('/usage', usageRouter);
  authed.use('/billing', billingRouter);
  authed.use('/routing', routingRouter);
  authed.use('/playground', playgroundRouter);
  authed.use('/sellers', sellersRouter);
  authed.use('/orgs', teamsRouter);
  authed.use('/settings', settingsRouter);
  authed.use('/favorites', favoritesRouter);
  authed.use('/comparisons', comparisonsRouter);
  authed.use('/alerts', alertsRouter);
  authed.use('/webhooks', webhooksRouter);
  authed.use('/admin', adminRouter);
  api.use(authed);
  app.use('/api', api);
  app.use(['/api', '/v1'], notFoundHandler);

  // ── Production: serve the built SPA ──
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
  if (env.isProd && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|v1).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
