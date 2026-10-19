import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { decryptSecret } from '../security/crypto.js';
import { readCapped, safeFetch } from '../security/ssrf.js';
import { signWebhook } from '../security/webhookSignature.js';
import { sanitizeUpstreamError } from '../security/redact.js';

export const webhookSecretContext = (endpointId: string) => `webhook-secret:${endpointId}`;
/** Delay before attempt N+1 (seconds). After the last entry the delivery is marked FAILED. */
export const RETRY_SCHEDULE_SECONDS = [30, 120, 600, 3600, 21_600];
const MAX_ATTEMPTS = RETRY_SCHEDULE_SECONDS.length + 1;
const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Claim due deliveries with SKIP LOCKED (safe with multiple API instances),
 * leasing them for 2 minutes, then deliver each one.
 */
export async function processWebhookDeliveries(batch = 20): Promise<number> {
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "WebhookDelivery" SET "nextAttemptAt" = now() + interval '2 minutes'
    WHERE id IN (
      SELECT id FROM "WebhookDelivery" WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
      ORDER BY "nextAttemptAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED)
    RETURNING id`;
  for (const { id } of claimed) await deliver(id);
  return claimed.length;
}

export async function deliver(deliveryId: string): Promise<boolean> {
  const d = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
  if (!d) return false;
  if (!d.endpoint.active) {
    await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', lastError: 'Endpoint disabled' } });
    return false;
  }
  const attempt = d.attempts + 1;
  const body = JSON.stringify({ id: d.id, ...(d.payload as Record<string, unknown>) });
  let status: number | null = null;
  let error: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), DELIVERY_TIMEOUT_MS);
  try {
    const secret = decryptSecret(
      { ciphertext: d.endpoint.secretCiphertext, iv: d.endpoint.secretIv, authTag: d.endpoint.secretAuthTag, wrappedKey: d.endpoint.secretWrappedKey, keyVersion: d.endpoint.secretKeyVersion },
      webhookSecretContext(d.endpoint.id),
    );
    const res = await safeFetch(d.endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Nexovra-Webhooks/1.0',
        'nexovra-event': d.event,
        'nexovra-delivery-id': d.id,
        'nexovra-signature': signWebhook(secret, body),
      },
      body,
      signal: controller.signal,
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}: ${sanitizeUpstreamError(await readCapped(res, 1024).catch(() => ''), 200)}`;
    else await res.body?.cancel().catch(() => undefined);
  } catch (err) {
    error = controller.signal.aborted ? `Timed out after ${DELIVERY_TIMEOUT_MS} ms` : sanitizeUpstreamError(err instanceof Error ? err.message : String(err), 200);
  } finally {
    clearTimeout(timer);
  }

  if (!error) {
    await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'SUCCESS', attempts: attempt, responseStatus: status, lastError: null, deliveredAt: new Date() } });
    return true;
  }
  const final = attempt >= MAX_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id: d.id },
    data: {
      status: final ? 'FAILED' : 'PENDING',
      attempts: attempt,
      responseStatus: status,
      lastError: error,
      nextAttemptAt: final ? d.nextAttemptAt : new Date(Date.now() + RETRY_SCHEDULE_SECONDS[attempt - 1]! * 1000),
    },
  });
  if (final) logger.warn({ deliveryId: d.id, endpointId: d.endpointId }, 'webhook delivery permanently failed');
  return false;
}
