import { prisma } from '../lib/prisma.js';
import { store } from '../lib/store.js';
import { logger } from '../lib/logger.js';
import { probeOffer } from './offerValidation.js';
import { processWebhookDeliveries } from './webhookWorker.js';
import { emitEvent } from './events.js';

async function heartbeat(name: string, fn: () => Promise<unknown>) {
  let lastError: string | null = null;
  try {
    await fn();
  } catch (err) {
    lastError = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    logger.error({ err, worker: name }, 'worker run failed');
  }
  await prisma.workerHeartbeat
    .upsert({ where: { name }, create: { name, lastRunAt: new Date(), lastError }, update: { lastRunAt: new Date(), lastError } })
    .catch(() => undefined);
}

/** Recovery probes for unhealthy offers + periodic probes for demo offers (free to run). */
export async function runHealthChecks() {
  const now = new Date();
  const due = await prisma.offer.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { healthStatus: 'UNHEALTHY', unhealthyUntil: { lte: now } },
        { isDemo: true, healthChecks: { none: { checkedAt: { gte: new Date(Date.now() - 10 * 60_000) } } } },
      ],
    },
    select: { id: true },
    take: 25,
  });
  for (const o of due) await probeOffer(o.id).catch((err) => logger.warn({ err, offerId: o.id }, 'probe failed'));
  return due.length;
}

/** Retention and cleanup policies. */
export async function runRetention() {
  const now = new Date();
  await prisma.$executeRaw`UPDATE "InferenceRequest" SET payload = NULL, "payloadExpiresAt" = NULL WHERE "payloadExpiresAt" IS NOT NULL AND "payloadExpiresAt" < ${now}`;
  await prisma.$executeRaw`
    DELETE FROM "InferenceRequest" r USING "Organization" o
    WHERE r."orgId" = o.id AND r.status <> 'IN_PROGRESS' AND r."createdAt" < now() - make_interval(days => o."requestLogRetentionDays")`;
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) }, status: { not: 'PENDING' } } });
  await prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
  await prisma.offerHealthCheck.deleteMany({ where: { checkedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
}

/** Detect sudden request spikes per organization (5× the trailing 7-day hourly average, min 50/hour). */
export async function detectUnusualUsage() {
  const rows = await prisma.$queryRaw<Array<{ orgId: string; lastHour: bigint; prior: bigint }>>`
    SELECT "orgId",
      COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '1 hour')::bigint AS "lastHour",
      COUNT(*) FILTER (WHERE "createdAt" < now() - interval '1 hour')::bigint AS prior
    FROM "InferenceRequest" WHERE "createdAt" >= now() - interval '7 days' AND source = 'API'
    GROUP BY "orgId"`;
  for (const r of rows) {
    const lastHour = Number(r.lastHour);
    const avg = Number(r.prior) / (7 * 24 - 1);
    if (lastHour < 50 || lastHour < avg * 5) continue;
    const key = `unusual:${r.orgId}`;
    if (await store.get(key)) continue;
    await store.set(key, '1', 6 * 3600);
    await emitEvent({
      orgId: r.orgId,
      type: 'usage.unusual',
      severity: 'warning',
      title: 'Unusual API usage detected',
      body: `${lastHour} API requests in the last hour vs. a trailing average of ${avg.toFixed(1)} per hour. Check your keys and budgets.`,
      data: { last_hour: lastHour, trailing_hourly_avg: Number(avg.toFixed(2)) },
    });
  }
}

const timers: NodeJS.Timeout[] = [];

export function startWorkers() {
  const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      await heartbeat(name, fn);
      running = false;
    };
    timers.push(setInterval(tick, ms));
    setTimeout(tick, 2000);
  };
  every(5_000, 'webhook-delivery', () => processWebhookDeliveries());
  every(60_000, 'health-checker', runHealthChecks);
  every(10 * 60_000, 'unusual-usage', detectUnusualUsage);
  every(60 * 60_000, 'retention', runRetention);
  logger.info('background workers started');
}

export function stopWorkers() {
  timers.splice(0).forEach(clearInterval);
}
