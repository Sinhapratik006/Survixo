import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export const WEBHOOK_EVENTS = [
  'budget.threshold',
  'offer.failed',
  'provider.down',
  'usage.unusual',
  'key.revoked',
  'payout.updated',
  'test.ping',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface EventInput {
  orgId: string;
  type: WebhookEvent;
  title: string;
  body: string;
  severity?: 'info' | 'warning' | 'critical';
  data?: Record<string, unknown>;
}

/**
 * Emit an account event: stores an in-app notification and enqueues signed
 * webhook deliveries for every active endpoint subscribed to the event.
 * Delivery happens asynchronously in the webhook worker.
 */
export async function emitEvent(e: EventInput): Promise<void> {
  try {
    const data = (e.data ?? {}) as Prisma.InputJsonValue;
    await prisma.notification.create({
      data: { orgId: e.orgId, type: e.type, severity: e.severity ?? 'info', title: e.title, body: e.body, data },
    });
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { orgId: e.orgId, active: true, events: { has: e.type } },
      select: { id: true },
    });
    if (!endpoints.length) return;
    const createdAt = new Date().toISOString();
    await prisma.webhookDelivery.createMany({
      data: endpoints.map((ep) => ({
        endpointId: ep.id,
        event: e.type,
        payload: { type: e.type, created_at: createdAt, org_id: e.orgId, title: e.title, body: e.body, data } as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    logger.error({ err, type: e.type }, 'failed to emit event');
  }
}
