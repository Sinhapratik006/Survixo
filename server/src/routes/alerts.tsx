import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import type { WebhookEndpoint } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parse } from '../middleware/error.js';
import { requireOrg, requirePermission } from '../middleware/org.js';
import { SsrfError, validateOutboundUrl } from '../security/ssrf.js';
import { encryptSecret } from '../security/crypto.js';
import { WEBHOOK_EVENTS, emitEvent } from '../services/events.js';
import { audit } from '../services/audit.js';
import { clientIp } from '../services/sessions.js';
import { webhookSecretContext } from '../services/webhookWorker.js';

export const alertsRouter = Router();
alertsRouter.use(requireOrg());

alertsRouter.get('/', requirePermission('usage:view'), async (req, res) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { orgId: req.org!.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.notification.count({ where: { orgId: req.org!.id, readAt: null } }),
  ]);
  res.json({ data: items, unread });
});

alertsRouter.post('/read-all', requirePermission('usage:view'), async (req, res) => {
  await prisma.notification.updateMany({ where: { orgId: req.org!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

alertsRouter.post('/:id/read', requirePermission('usage:view'), async (req, res) => {
  await prisma.notification.updateMany({ where: { id: String(req.params.id), orgId: req.org!.id }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

// ───────────── Webhooks ─────────────

export const webhooksRouter = Router();
webhooksRouter.use(requireOrg());

function serialize(w: WebhookEndpoint & { _count?: { deliveries: number } }) {
  return { id: w.id, url: w.url, description: w.description, events: w.events, active: w.active, createdAt: w.createdAt };
}

const eventsSchema = z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length);
const createSchema = z.object({ url: z.string().trim().url().max(500), events: eventsSchema, description: z.string().trim().max(200).optional() });

async function safeUrl(url: string) {
  try {
    return (await validateOutboundUrl(url)).toString();
  } catch (err) {
    if (err instanceof SsrfError) throw badRequest(`Webhook URL rejected: ${err.message}`, undefined, 'unsafe_url');
    throw err;
  }
}

function newSecret() {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

webhooksRouter.get('/', requirePermission('usage:view'), async (req, res) => {
  const hooks = await prisma.webhookEndpoint.findMany({ where: { orgId: req.org!.id }, orderBy: { createdAt: 'desc' } });
  res.json({ data: hooks.map(serialize), availableEvents: WEBHOOK_EVENTS });
});

webhooksRouter.post('/', requirePermission('webhooks:manage'), async (req, res) => {
  const body = parse(createSchema, req.body);
  if ((await prisma.webhookEndpoint.count({ where: { orgId: req.org!.id } })) >= 10) throw badRequest('At most 10 webhook endpoints per organization');
  const url = await safeUrl(body.url);
  const secret = newSecret();
  const hook = await prisma.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({
      data: { orgId: req.org!.id, url, events: body.events, description: body.description, secretCiphertext: '', secretIv: '', secretAuthTag: '', secretWrappedKey: '' },
    });
    const enc = encryptSecret(secret, webhookSecretContext(created.id));
    return tx.webhookEndpoint.update({
      where: { id: created.id },
      data: { secretCiphertext: enc.ciphertext, secretIv: enc.iv, secretAuthTag: enc.authTag, secretWrappedKey: enc.wrappedKey, secretKeyVersion: enc.keyVersion },
    });
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'webhook.created', targetType: 'webhook', targetId: hook.id, ip: clientIp(req) });
  res.status(201).json({ webhook: serialize(hook), secret });
});

const updateSchema = z.object({ url: z.string().trim().url().max(500).optional(), events: eventsSchema.optional(), active: z.boolean().optional(), description: z.string().trim().max(200).nullish() });

webhooksRouter.patch('/:id', requirePermission('webhooks:manage'), async (req, res) => {
  const body = parse(updateSchema, req.body);
  const hook = await prisma.webhookEndpoint.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!hook) throw notFound('Webhook not found');
  const updated = await prisma.webhookEndpoint.update({
    where: { id: hook.id },
    data: { ...(body.url && { url: await safeUrl(body.url) }), ...(body.events && { events: body.events }), ...(body.active !== undefined && { active: body.active }), ...(body.description !== undefined && { description: body.description }) },
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'webhook.updated', targetType: 'webhook', targetId: hook.id, ip: clientIp(req) });
  res.json({ webhook: serialize(updated) });
});

webhooksRouter.post('/:id/rotate-secret', requirePermission('webhooks:manage'), async (req, res) => {
  const hook = await prisma.webhookEndpoint.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!hook) throw notFound('Webhook not found');
  const secret = newSecret();
  const enc = encryptSecret(secret, webhookSecretContext(hook.id));
  await prisma.webhookEndpoint.update({
    where: { id: hook.id },
    data: { secretCiphertext: enc.ciphertext, secretIv: enc.iv, secretAuthTag: enc.authTag, secretWrappedKey: enc.wrappedKey, secretKeyVersion: enc.keyVersion },
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'webhook.secret_rotated', targetType: 'webhook', targetId: hook.id, ip: clientIp(req) });
  res.json({ secret });
});

webhooksRouter.delete('/:id', requirePermission('webhooks:manage'), async (req, res) => {
  const r = await prisma.webhookEndpoint.deleteMany({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!r.count) throw notFound('Webhook not found');
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'webhook.deleted', targetType: 'webhook', targetId: String(req.params.id), ip: clientIp(req) });
  res.json({ ok: true });
});

webhooksRouter.post('/:id/test', requirePermission('webhooks:manage'), async (req, res) => {
  const hook = await prisma.webhookEndpoint.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!hook) throw notFound('Webhook not found');
  const delivery = await prisma.webhookDelivery.create({
    data: { endpointId: hook.id, event: 'test.ping', payload: { type: 'test.ping', created_at: new Date().toISOString(), org_id: req.org!.id, title: 'Test event', body: 'This is a test delivery from Nexovra.', data: {} } },
  });
  res.status(202).json({ deliveryId: delivery.id });
});

webhooksRouter.get('/:id/deliveries', requirePermission('usage:view'), async (req, res) => {
  const hook = await prisma.webhookEndpoint.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!hook) throw notFound('Webhook not found');
  const deliveries = await prisma.webhookDelivery.findMany({ where: { endpointId: hook.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ data: deliveries });
});

webhooksRouter.post('/deliveries/:id/retry', requirePermission('webhooks:manage'), async (req, res) => {
  const d = await prisma.webhookDelivery.findFirst({ where: { id: String(req.params.id), endpoint: { orgId: req.org!.id } } });
  if (!d) throw notFound('Delivery not found');
  if (d.status === 'SUCCESS') throw badRequest('This delivery already succeeded; send a test event instead.');
  await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'PENDING', nextAttemptAt: new Date(), attempts: 0 } });
  res.status(202).json({ ok: true });
});

export { emitEvent };
