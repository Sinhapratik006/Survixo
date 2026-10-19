import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { AdapterError } from '../providers/types.js';
import { emitEvent } from './events.js';

/** Backoff ladder (minutes) between recovery probes after consecutive failures. */
export const BACKOFF_MINUTES = [1, 2, 5, 10, 30, 60];

export function backoffMs(consecutiveFailures: number, kind?: AdapterError['kind']): number {
  if (kind === 'rate_limited') return 30_000;
  const idx = Math.min(Math.max(consecutiveFailures, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[idx]! * 60_000;
}

/** A failed live request takes the offer out of routing until a recovery probe succeeds. */
export async function markOfferFailure(offerId: string, err: AdapterError): Promise<void> {
  try {
    const offer = await prisma.offer.update({
      where: { id: offerId },
      data: { consecutiveFailures: { increment: 1 }, lastFailureReason: `${err.kind}: ${err.message}`.slice(0, 300) },
      select: { id: true, consecutiveFailures: true, healthStatus: true, sellerOrgId: true, modelId: true },
    });
    const wasHealthy = offer.healthStatus !== 'UNHEALTHY';
    await prisma.offer.update({
      where: { id: offerId },
      data: { healthStatus: 'UNHEALTHY', unhealthyUntil: new Date(Date.now() + backoffMs(offer.consecutiveFailures, err.kind)) },
    });
    if (wasHealthy) {
      await emitEvent({
        orgId: offer.sellerOrgId,
        type: 'offer.failed',
        severity: 'warning',
        title: `Offer for ${offer.modelId} was taken out of routing`,
        body: `A live request failed (${err.kind}). The offer will be re-probed automatically with exponential backoff.`,
        data: { offer_id: offer.id, model_id: offer.modelId, error_kind: err.kind, consecutive_failures: offer.consecutiveFailures },
      });
    }
  } catch (e) {
    logger.error({ err: e, offerId }, 'failed to mark offer failure');
  }
}

/** A served request resets the failure ladder. */
export async function markOfferSuccess(offerId: string): Promise<void> {
  await prisma.offer
    .updateMany({
      where: { id: offerId, OR: [{ consecutiveFailures: { gt: 0 } }, { healthStatus: { not: 'HEALTHY' } }] },
      data: { consecutiveFailures: 0, healthStatus: 'HEALTHY', unhealthyUntil: null },
    })
    .catch((e) => logger.error({ err: e, offerId }, 'failed to mark offer success'));
}
