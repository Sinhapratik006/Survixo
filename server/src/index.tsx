import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { store } from './lib/store.js';
import { startWorkers, stopWorkers } from './services/workers.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, demoMode: env.DEMO_MODE, billingMode: env.BILLING_MODE, googleAuth: env.googleEnabled, store: store.kind },
    `Nexovra API listening on http://localhost:${env.PORT}`,
  );
});

if (env.RUN_WORKERS) startWorkers();

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  stopWorkers();
  server.close();
  await Promise.allSettled([prisma.$disconnect(), store.close()]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
