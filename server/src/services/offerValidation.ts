import type { Offer, SellerEndpoint } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getAdapter } from '../providers/registry.js';
import { AdapterError, type AdapterContext } from '../providers/types.js';
import { loadEndpointCredential } from './credentials.js';
import { backoffMs } from './offerHealth.js';
import { emitEvent } from './events.js';

const VERIFY_TIMEOUT_MS = 15_000;

async function context(endpoint: SellerEndpoint, timeoutMs: number): Promise<{ ctx: AdapterContext; clear: () => void }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  return {
    ctx: {
      baseUrl: endpoint.baseUrl,
      apiKey: await loadEndpointCredential(endpoint.id),
      config: endpoint.config as Record<string, unknown> | null,
      signal: controller.signal,
    },
    clear: () => clearTimeout(timer),
  };
}

function describe(err: unknown): string {
  if (err instanceof AdapterError) return `${err.kind}: ${err.message}`.slice(0, 300);
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

/** Verify connectivity and credentials, and discover the models the endpoint serves. */
export async function verifyEndpoint(endpointId: string) {
  const endpoint = await prisma.sellerEndpoint.findUniqueOrThrow({ where: { id: endpointId } });
  const { ctx, clear } = await context(endpoint, VERIFY_TIMEOUT_MS);
  try {
    const models = await getAdapter(endpoint.adapter).listModels(ctx);
    if (!models.length) throw new AdapterError('bad_response', 'The endpoint returned an empty model list');
    return prisma.sellerEndpoint.update({
      where: { id: endpoint.id },
      data: { status: 'VERIFIED', statusMessage: `Discovered ${models.length} model(s)`, discoveredModels: models, lastVerifiedAt: new Date() },
    });
  } catch (err) {
    return prisma.sellerEndpoint.update({
      where: { id: endpoint.id },
      data: { status: 'FAILED', statusMessage: describe(err), discoveredModels: [] },
    });
  } finally {
    clear();
  }
}

export interface ValidationStep {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Offer validation gate. An offer can only be activated after every step
 * passes: verified endpoint, verifiable model mapping (upstream model listed
 * by the endpoint), supported catalog model, and live test completions.
 */
export async function validateOffer(offerId: string): Promise<{ ok: boolean; steps: ValidationStep[]; offer: Offer }> {
  const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId }, include: { endpoint: true, model: { include: { capabilities: true } } } });
  const steps: ValidationStep[] = [];
  const fail = async (reason: string) => {
    const updated = await prisma.offer.update({ where: { id: offer.id }, data: { validatedAt: null, validationError: reason, verifiedCapabilities: [] } });
    return { ok: false, steps, offer: updated };
  };

  steps.push({ name: 'Endpoint verified', ok: offer.endpoint.status === 'VERIFIED', detail: offer.endpoint.statusMessage ?? offer.endpoint.status });
  if (offer.endpoint.status !== 'VERIFIED') return fail('Endpoint is not verified');

  const mapped = offer.endpoint.discoveredModels.includes(offer.upstreamModel);
  steps.push({ name: 'Model mapping', ok: mapped, detail: mapped ? `"${offer.upstreamModel}" is listed by the endpoint` : `"${offer.upstreamModel}" is not in the endpoint's model list` });
  if (!mapped) return fail('Upstream model is not served by the endpoint');

  const supported = offer.model.apiSupported && offer.model.capabilities.some((c) => c.capability === 'chat');
  steps.push({ name: 'Catalog model supports chat', ok: supported, detail: supported ? offer.model.name : 'This catalog model is not available through the chat API' });
  if (!supported) return fail('Catalog model does not support chat completions');

  const adapter = getAdapter(offer.endpoint.adapter);
  const request = { model: offer.upstreamModel, messages: [{ role: 'user' as const, content: 'Reply with the single word OK.' }], max_tokens: 8, temperature: 0 };
  const verified: string[] = [];

  let started = Date.now();
  let { ctx, clear } = await context(offer.endpoint, Math.min(offer.timeoutMs, 30_000));
  try {
    const r = await adapter.chat(request, ctx);
    const latency = Date.now() - started;
    await prisma.offerHealthCheck.create({ data: { offerId: offer.id, kind: 'VALIDATION', ok: true, latencyMs: latency } });
    steps.push({ name: 'Test completion', ok: true, detail: `Responded in ${latency} ms${r.usage ? ` (${r.usage.completion_tokens} output tokens reported)` : ' (no usage reported; tokens will be estimated)'}` });
    verified.push('chat');
  } catch (err) {
    await prisma.offerHealthCheck.create({ data: { offerId: offer.id, kind: 'VALIDATION', ok: false, latencyMs: Date.now() - started, statusCode: err instanceof AdapterError ? err.status : null, error: describe(err) } });
    steps.push({ name: 'Test completion', ok: false, detail: describe(err) });
    clear();
    return fail(`Test completion failed: ${describe(err)}`);
  }
  clear();

  if (adapter.features.streaming) {
    started = Date.now();
    ({ ctx, clear } = await context(offer.endpoint, Math.min(offer.timeoutMs, 30_000)));
    try {
      let chunks = 0;
      for await (const chunk of adapter.chatStream(request, ctx)) if (chunk.content) chunks++;
      if (!chunks) throw new AdapterError('bad_response', 'Stream contained no content');
      steps.push({ name: 'Streaming test', ok: true, detail: `${chunks} chunk(s) in ${Date.now() - started} ms` });
      verified.push('streaming');
    } catch (err) {
      steps.push({ name: 'Streaming test', ok: false, detail: `${describe(err)} - offer will not receive streaming requests` });
    } finally {
      clear();
    }
  }

  const updated = await prisma.offer.update({
    where: { id: offer.id },
    data: { validatedAt: new Date(), validationError: null, verifiedCapabilities: verified, healthStatus: 'HEALTHY', unhealthyUntil: null },
  });
  return { ok: true, steps, offer: updated };
}

/** Recovery probe for unhealthy offers (and periodic checks for demo offers). */
export async function probeOffer(offerId: string): Promise<boolean> {
  const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId }, include: { endpoint: true } });
  const started = Date.now();
  const { ctx, clear } = await context(offer.endpoint, Math.min(offer.timeoutMs, 20_000));
  try {
    await getAdapter(offer.endpoint.adapter).chat(
      { model: offer.upstreamModel, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 16, temperature: 0 },
      ctx,
    );
    await prisma.offerHealthCheck.create({ data: { offerId, kind: 'PROBE', ok: true, latencyMs: Date.now() - started } });
    // consecutiveFailures is preserved: only a served live request resets the backoff ladder.
    await prisma.offer.update({ where: { id: offerId }, data: { healthStatus: 'HEALTHY', unhealthyUntil: null } });
    return true;
  } catch (err) {
    const failures = offer.consecutiveFailures + 1;
    await prisma.offerHealthCheck.create({
      data: { offerId, kind: 'PROBE', ok: false, latencyMs: Date.now() - started, statusCode: err instanceof AdapterError ? err.status : null, error: describe(err) },
    });
    const wasHealthy = offer.healthStatus !== 'UNHEALTHY';
    await prisma.offer.update({
      where: { id: offerId },
      data: {
        healthStatus: 'UNHEALTHY',
        consecutiveFailures: failures,
        lastFailureReason: describe(err),
        unhealthyUntil: new Date(Date.now() + backoffMs(failures, err instanceof AdapterError ? err.kind : undefined)),
      },
    });
    if (wasHealthy)
      await emitEvent({
        orgId: offer.sellerOrgId,
        type: 'offer.failed',
        severity: 'warning',
        title: `Health probe failed for ${offer.modelId}`,
        body: `The offer was taken out of routing: ${describe(err)}`,
        data: { offer_id: offer.id, model_id: offer.modelId },
      });
    return false;
  } finally {
    clear();
  }
}
