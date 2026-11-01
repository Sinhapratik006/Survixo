import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Offer, SellerEndpoint } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { HttpError, badRequest, notFound } from '../lib/errors.js';
import { microsToUsd, nullableMicrosToUsd, pricePerMToUsd, usdPerMToPrice, usdToMicros } from '../lib/money.js';
import { parse } from '../middleware/error.js';
import { requireOrg, requirePermission } from '../middleware/org.js';
import { rateLimit, userKey } from '../middleware/rateLimit.js';
import { SsrfError, validateOutboundUrl } from '../security/ssrf.js';
import { storeEndpointCredential } from '../services/credentials.js';
import { validateOffer, verifyEndpoint } from '../services/offerValidation.js';
import { getOfferMetrics } from '../services/stats.js';
import { requestPayout } from '../billing/ledger.js';
import { audit } from '../services/audit.js';
import { emitEvent } from '../services/events.js';
import { clientIp } from '../services/sessions.js';

export const sellersRouter = Router();
sellersRouter.use(requireOrg());

const verifyLimiter = rateLimit({ name: 'seller-verify', windowSeconds: 60, max: 10, key: userKey });

function serializeEndpoint(e: SellerEndpoint & { credential?: { hint: string; rotatedAt: Date | null } | null; _count?: { offers: number } }) {
  return {
    id: e.id,
    name: e.name,
    adapter: e.adapter,
    baseUrl: e.adapter === 'demo' ? 'demo://synthetic' : e.baseUrl,
    status: e.status,
    statusMessage: e.statusMessage,
    discoveredModels: e.discoveredModels.slice(0, 500),
    discoveredModelCount: e.discoveredModels.length,
    credentialHint: e.credential?.hint ?? null,
    credentialRotatedAt: e.credential?.rotatedAt ?? null,
    lastVerifiedAt: e.lastVerifiedAt,
    offerCount: e._count?.offers ?? undefined,
    createdAt: e.createdAt,
  };
}

function serializeOffer(o: Offer & { model?: { name: string } ; endpoint?: { name: string; adapter: string } }) {
  return {
    id: o.id,
    modelId: o.modelId,
    modelName: o.model?.name,
    endpointId: o.endpointId,
    endpointName: o.endpoint?.name,
    adapter: o.endpoint?.adapter,
    upstreamModel: o.upstreamModel,
    inputPriceUsd: pricePerMToUsd(o.inputPrice),
    outputPriceUsd: pricePerMToUsd(o.outputPrice),
    status: o.status,
    healthStatus: o.healthStatus,
    consecutiveFailures: o.consecutiveFailures,
    unhealthyUntil: o.unhealthyUntil,
    lastFailureReason: o.lastFailureReason,
    verifiedCapabilities: o.verifiedCapabilities,
    validatedAt: o.validatedAt,
    validationError: o.validationError,
    maxConcurrency: o.maxConcurrency,
    rpmLimit: o.rpmLimit,
    timeoutMs: o.timeoutMs,
    dailySpendCapUsd: nullableMicrosToUsd(o.dailySpendCapMicros),
    isDemo: o.isDemo,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

// ───────────── Overview ─────────────

sellersRouter.get('/overview', requirePermission('seller:view'), async (req, res) => {
  const orgId = req.org!.id;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [org, offers, endpoints, daily, latency, payoutsPending] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { sellerBalanceMicros: true } }),
    prisma.offer.groupBy({ by: ['status'], where: { sellerOrgId: orgId, status: { not: 'ARCHIVED' } }, _count: { _all: true } }),
    prisma.sellerEndpoint.count({ where: { orgId, status: { not: 'DISABLED' } } }),
    prisma.$queryRaw<Array<{ day: Date; requests: bigint; earnings: bigint | null; tokens: bigint | null }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS requests,
        SUM("sellerEarningMicros")::bigint AS earnings, SUM("inputTokens" + "outputTokens")::bigint AS tokens
      FROM "InferenceRequest" WHERE "sellerOrgId" = ${orgId} AND status = 'SUCCESS' AND "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ total: bigint; ok: bigint; p50: number | null; p95: number | null }>>`
      SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE a.ok)::bigint AS ok,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY a."latencyMs") FILTER (WHERE a.ok))::float AS p50,
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY a."latencyMs") FILTER (WHERE a.ok))::float AS p95
      FROM "RequestAttempt" a JOIN "Offer" o ON o.id = a."offerId"
      WHERE o."sellerOrgId" = ${orgId} AND a."createdAt" >= ${since}`,
    prisma.payout.aggregate({ where: { orgId, status: { in: ['REQUESTED', 'PROCESSING'] } }, _sum: { amountMicros: true } }),
  ]);
  const l = latency[0];
  const total = Number(l?.total ?? 0n);
  res.json({
    sellerBalanceUsd: microsToUsd(org.sellerBalanceMicros),
    pendingPayoutsUsd: microsToUsd(payoutsPending._sum.amountMicros),
    platformFeeBps: env.PLATFORM_FEE_BPS,
    endpoints,
    offersByStatus: Object.fromEntries(offers.map((o) => [o.status, o._count._all])),
    last30d: {
      requests: daily.reduce((s, d) => s + Number(d.requests), 0),
      earningsUsd: microsToUsd(daily.reduce((s, d) => s + (d.earnings ?? 0n), 0n)),
      attempts: total,
      errorRate: total ? 1 - Number(l!.ok) / total : null,
      p50LatencyMs: l?.p50 != null ? Math.round(l.p50) : null,
      p95LatencyMs: l?.p95 != null ? Math.round(l.p95) : null,
    },
    series: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), requests: Number(d.requests), earningsUsd: microsToUsd(d.earnings ?? 0n), tokens: Number(d.tokens ?? 0n) })),
  });
});

// ───────────── Endpoints ─────────────

const endpointSchema = z.object({
  name: z.string().trim().min(1).max(60),
  adapter: z.enum(['openai_compatible', 'demo']),
  baseUrl: z.string().trim().max(500).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  demoConfig: z
    .object({ latencyMinMs: z.number().int().min(0).max(10_000), latencyMaxMs: z.number().int().min(0).max(20_000), failureRate: z.number().min(0).max(1) })
    .optional(),
});

async function ownedEndpoint(req: Request, id: string) {
  const e = await prisma.sellerEndpoint.findFirst({ where: { id, orgId: req.org!.id } });
  if (!e) throw notFound('Endpoint not found');
  return e;
}

sellersRouter.get('/endpoints', requirePermission('seller:view'), async (req, res) => {
  const endpoints = await prisma.sellerEndpoint.findMany({
    where: { orgId: req.org!.id, status: { not: 'DISABLED' } },
    include: { credential: { select: { hint: true, rotatedAt: true } }, _count: { select: { offers: { where: { status: { not: 'ARCHIVED' } } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: endpoints.map(serializeEndpoint) });
});

sellersRouter.post('/endpoints', requirePermission('seller:manage'), async (req, res) => {
  const body = parse(endpointSchema, req.body);
  let baseUrl: string;
  let config: Record<string, unknown> | undefined;
  if (body.adapter === 'demo') {
    if (!env.DEMO_MODE) throw new HttpError(403, 'demo_disabled', 'Demo endpoints are disabled on this server.');
    const models = await prisma.model.findMany({ where: { apiSupported: true }, select: { id: true } });
    const dc = body.demoConfig ?? { latencyMinMs: 150, latencyMaxMs: 600, failureRate: 0 };
    config = { models: models.map((m) => m.id), latencyMs: [dc.latencyMinMs, Math.max(dc.latencyMinMs, dc.latencyMaxMs)], failureRate: dc.failureRate, arithmeticAccuracy: 0.85 };
    baseUrl = 'demo://synthetic';
  } else {
    if (!body.baseUrl) throw badRequest('baseUrl is required for OpenAI-compatible endpoints');
    if (!body.apiKey) throw badRequest('apiKey is required for OpenAI-compatible endpoints');
    try {
      baseUrl = (await validateOutboundUrl(body.baseUrl)).toString().replace(/\/+$/, '');
    } catch (err) {
      if (err instanceof SsrfError) throw badRequest(`Endpoint URL rejected: ${err.message}`, undefined, 'unsafe_url');
      throw err;
    }
  }
  const count = await prisma.sellerEndpoint.count({ where: { orgId: req.org!.id, status: { not: 'DISABLED' } } });
  if (count >= 20) throw badRequest('At most 20 endpoints per organization');
  const endpoint = await prisma.sellerEndpoint.create({
    data: { orgId: req.org!.id, name: body.name, adapter: body.adapter, baseUrl, config: config as never },
  });
  if (body.apiKey && body.adapter !== 'demo') await storeEndpointCredential(endpoint.id, body.apiKey);
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.endpoint.created', targetType: 'endpoint', targetId: endpoint.id, ip: clientIp(req), metadata: { adapter: body.adapter } });
  const verified = await verifyEndpoint(endpoint.id);
  const full = await prisma.sellerEndpoint.findUniqueOrThrow({ where: { id: verified.id }, include: { credential: { select: { hint: true, rotatedAt: true } } } });
  res.status(201).json({ endpoint: serializeEndpoint(full) });
});

const endpointUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  apiKey: z.string().min(1).max(500).optional(),
});

sellersRouter.patch('/endpoints/:id', requirePermission('seller:manage'), async (req, res) => {
  const body = parse(endpointUpdateSchema, req.body);
  const endpoint = await ownedEndpoint(req, String(req.params.id));
  const connectionChanged = Boolean(body.baseUrl || body.apiKey);
  if (endpoint.adapter === 'demo' && connectionChanged) throw badRequest('Demo endpoints have no URL or credential');
  let baseUrl = endpoint.baseUrl;
  if (body.baseUrl) {
    try {
      baseUrl = (await validateOutboundUrl(body.baseUrl)).toString().replace(/\/+$/, '');
    } catch (err) {
      if (err instanceof SsrfError) throw badRequest(`Endpoint URL rejected: ${err.message}`, undefined, 'unsafe_url');
      throw err;
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.sellerEndpoint.update({
      where: { id: endpoint.id },
      data: { ...(body.name && { name: body.name }), baseUrl, ...(connectionChanged && { status: 'PENDING', statusMessage: 'Re-verification required' }) },
    });
    // Connection changes invalidate prior validation: offers must be re-validated before serving again.
    if (connectionChanged)
      await tx.offer.updateMany({ where: { endpointId: endpoint.id, status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } }, data: { validatedAt: null, status: 'PAUSED', verifiedCapabilities: [] } });
  });
  if (body.apiKey) await storeEndpointCredential(endpoint.id, body.apiKey);
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: body.apiKey ? 'seller.credential.rotated' : 'seller.endpoint.updated', targetType: 'endpoint', targetId: endpoint.id, ip: clientIp(req) });
  const result = connectionChanged ? await verifyEndpoint(endpoint.id) : endpoint;
  const full = await prisma.sellerEndpoint.findUniqueOrThrow({ where: { id: result.id }, include: { credential: { select: { hint: true, rotatedAt: true } } } });
  res.json({ endpoint: serializeEndpoint(full) });
});

sellersRouter.post('/endpoints/:id/verify', requirePermission('seller:manage'), verifyLimiter, async (req, res) => {
  const endpoint = await ownedEndpoint(req, String(req.params.id));
  const verified = await verifyEndpoint(endpoint.id);
  const full = await prisma.sellerEndpoint.findUniqueOrThrow({ where: { id: verified.id }, include: { credential: { select: { hint: true, rotatedAt: true } } } });
  res.json({ endpoint: serializeEndpoint(full) });
});

/** Disabling an endpoint archives its offers and destroys the stored credential. */
sellersRouter.delete('/endpoints/:id', requirePermission('seller:manage'), async (req, res) => {
  const endpoint = await ownedEndpoint(req, String(req.params.id));
  await prisma.$transaction([
    prisma.offer.updateMany({ where: { endpointId: endpoint.id }, data: { status: 'ARCHIVED' } }),
    prisma.providerCredential.deleteMany({ where: { endpointId: endpoint.id } }),
    prisma.sellerEndpoint.update({ where: { id: endpoint.id }, data: { status: 'DISABLED', discoveredModels: [] } }),
  ]);
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.endpoint.disabled', targetType: 'endpoint', targetId: endpoint.id, ip: clientIp(req) });
  res.json({ ok: true });
});

// ───────────── Offers ─────────────

const price = z.number().positive().max(1000);
const offerSchema = z.object({
  endpointId: z.string().max(40),
  modelId: z.string().min(1).max(200),
  upstreamModel: z.string().trim().min(1).max(200),
  inputPriceUsd: price,
  outputPriceUsd: price,
  maxConcurrency: z.number().int().min(1).max(1000).default(8),
  rpmLimit: z.number().int().min(1).max(100_000).default(120),
  timeoutMs: z.number().int().min(1000).max(300_000).default(30_000),
  dailySpendCapUsd: z.number().positive().max(1_000_000).nullish(),
});

async function ownedOffer(req: Request, id: string) {
  const o = await prisma.offer.findFirst({ where: { id, sellerOrgId: req.org!.id }, include: { model: { select: { name: true } }, endpoint: { select: { name: true, adapter: true } } } });
  if (!o) throw notFound('Offer not found');
  return o;
}

sellersRouter.get('/offers', requirePermission('seller:view'), async (req, res) => {
  const offers = await prisma.offer.findMany({
    where: { sellerOrgId: req.org!.id, status: { not: 'ARCHIVED' } },
    include: { model: { select: { name: true } }, endpoint: { select: { name: true, adapter: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const metrics = await getOfferMetrics(offers.map((o) => o.id));
  res.json({ data: offers.map((o) => ({ ...serializeOffer(o), stats: metrics.get(o.id)?.stats ?? null, reliability: metrics.get(o.id)?.reliability ?? null })) });
});

sellersRouter.get('/offers/:id', requirePermission('seller:view'), async (req, res) => {
  const offer = await ownedOffer(req, String(req.params.id));
  const [checks, history, metrics] = await Promise.all([
    prisma.offerHealthCheck.findMany({ where: { offerId: offer.id }, orderBy: { checkedAt: 'desc' }, take: 50 }),
    prisma.offerPriceHistory.findMany({ where: { offerId: offer.id }, orderBy: { recordedAt: 'desc' }, take: 50 }),
    getOfferMetrics([offer.id]),
  ]);
  const m = metrics.get(offer.id);
  res.json({
    offer: serializeOffer(offer),
    stats: m?.stats ?? null,
    reliability: m?.reliability ?? null,
    healthChecks: checks,
    priceHistory: history.map((h) => ({ at: h.recordedAt, inputPriceUsd: pricePerMToUsd(h.inputPrice), outputPriceUsd: pricePerMToUsd(h.outputPrice) })),
  });
});

sellersRouter.post('/offers', requirePermission('seller:manage'), async (req, res) => {
  const body = parse(offerSchema, req.body);
  const endpoint = await ownedEndpoint(req, body.endpointId);
  if (endpoint.status !== 'VERIFIED') throw badRequest('Verify the endpoint before creating offers', undefined, 'endpoint_not_verified');
  const model = await prisma.model.findUnique({ where: { id: body.modelId } });
  if (!model) throw badRequest('Unknown catalog model');
  if (!model.apiSupported) throw badRequest('This catalog model is not available through the chat API yet');
  if (!endpoint.discoveredModels.includes(body.upstreamModel))
    throw badRequest(`"${body.upstreamModel}" is not in the model list reported by this endpoint. Re-verify the endpoint or choose a listed model.`, undefined, 'unverifiable_mapping');
  const duplicate = await prisma.offer.findFirst({ where: { endpointId: endpoint.id, modelId: model.id, upstreamModel: body.upstreamModel, status: { not: 'ARCHIVED' } } });
  if (duplicate) throw badRequest('An offer for this model mapping already exists on this endpoint');
  const offer = await prisma.offer.create({
    data: {
      sellerOrgId: req.org!.id,
      endpointId: endpoint.id,
      modelId: model.id,
      upstreamModel: body.upstreamModel,
      inputPrice: usdPerMToPrice(body.inputPriceUsd),
      outputPrice: usdPerMToPrice(body.outputPriceUsd),
      maxConcurrency: body.maxConcurrency,
      rpmLimit: body.rpmLimit,
      timeoutMs: body.timeoutMs,
      dailySpendCapMicros: body.dailySpendCapUsd ? usdToMicros(body.dailySpendCapUsd) : null,
      isDemo: endpoint.adapter === 'demo',
      status: 'DRAFT',
      priceHistory: { create: { modelId: model.id, inputPrice: usdPerMToPrice(body.inputPriceUsd), outputPrice: usdPerMToPrice(body.outputPriceUsd) } },
    },
    include: { model: { select: { name: true } }, endpoint: { select: { name: true, adapter: true } } },
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.offer.created', targetType: 'offer', targetId: offer.id, ip: clientIp(req), metadata: { modelId: model.id } });
  res.status(201).json({ offer: serializeOffer(offer) });
});

const offerUpdateSchema = offerSchema.omit({ endpointId: true, modelId: true }).partial();

sellersRouter.patch('/offers/:id', requirePermission('seller:manage'), async (req, res) => {
  const body = parse(offerUpdateSchema, req.body);
  const offer = await ownedOffer(req, String(req.params.id));
  if (offer.status === 'ARCHIVED') throw badRequest('Archived offers cannot be edited');
  const mappingChanged = body.upstreamModel !== undefined && body.upstreamModel !== offer.upstreamModel;
  if (mappingChanged) {
    const endpoint = await prisma.sellerEndpoint.findUniqueOrThrow({ where: { id: offer.endpointId } });
    if (!endpoint.discoveredModels.includes(body.upstreamModel!)) throw badRequest('Upstream model is not listed by the endpoint', undefined, 'unverifiable_mapping');
  }
  const inputPrice = body.inputPriceUsd !== undefined ? usdPerMToPrice(body.inputPriceUsd) : offer.inputPrice;
  const outputPrice = body.outputPriceUsd !== undefined ? usdPerMToPrice(body.outputPriceUsd) : offer.outputPrice;
  const priceChanged = inputPrice !== offer.inputPrice || outputPrice !== offer.outputPrice;
  const updated = await prisma.offer.update({
    where: { id: offer.id },
    data: {
      ...(body.upstreamModel !== undefined && { upstreamModel: body.upstreamModel }),
      inputPrice,
      outputPrice,
      ...(body.maxConcurrency !== undefined && { maxConcurrency: body.maxConcurrency }),
      ...(body.rpmLimit !== undefined && { rpmLimit: body.rpmLimit }),
      ...(body.timeoutMs !== undefined && { timeoutMs: body.timeoutMs }),
      ...(body.dailySpendCapUsd !== undefined && { dailySpendCapMicros: body.dailySpendCapUsd ? usdToMicros(body.dailySpendCapUsd) : null }),
      // A new model mapping must pass validation again before it can serve traffic.
      ...(mappingChanged && { validatedAt: null, verifiedCapabilities: [], status: offer.status === 'ACTIVE' ? 'PAUSED' : offer.status }),
      ...(priceChanged && { priceHistory: { create: { modelId: offer.modelId, inputPrice, outputPrice } } }),
    },
    include: { model: { select: { name: true } }, endpoint: { select: { name: true, adapter: true } } },
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.offer.updated', targetType: 'offer', targetId: offer.id, ip: clientIp(req), metadata: body as never });
  res.json({ offer: serializeOffer(updated) });
});

sellersRouter.post('/offers/:id/validate', requirePermission('seller:manage'), verifyLimiter, async (req, res) => {
  const offer = await ownedOffer(req, String(req.params.id));
  if (offer.status === 'ARCHIVED') throw badRequest('Archived offers cannot be validated');
  const result = await validateOffer(offer.id);
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.offer.validated', targetType: 'offer', targetId: offer.id, ip: clientIp(req), metadata: { ok: result.ok } });
  const full = await ownedOffer(req, offer.id);
  res.json({ ok: result.ok, steps: result.steps, offer: serializeOffer(full) });
});

sellersRouter.post('/offers/:id/activate', requirePermission('seller:manage'), async (req, res) => {
  const offer = await ownedOffer(req, String(req.params.id));
  const endpoint = await prisma.sellerEndpoint.findUniqueOrThrow({ where: { id: offer.endpointId } });
  if (endpoint.status !== 'VERIFIED') throw badRequest('The endpoint must be verified before activation', undefined, 'endpoint_not_verified');
  if (!offer.validatedAt) throw badRequest('Run validation successfully before activating this offer', undefined, 'offer_not_validated');
  if (!['DRAFT', 'PAUSED'].includes(offer.status)) throw badRequest(`Offers in status ${offer.status} cannot be activated`);
  const updated = await prisma.offer.update({ where: { id: offer.id }, data: { status: 'ACTIVE' }, include: { model: { select: { name: true } }, endpoint: { select: { name: true, adapter: true } } } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.offer.activated', targetType: 'offer', targetId: offer.id, ip: clientIp(req) });
  res.json({ offer: serializeOffer(updated) });
});

sellersRouter.post('/offers/:id/pause', requirePermission('seller:manage'), async (req, res) => {
  const offer = await ownedOffer(req, String(req.params.id));
  if (offer.status !== 'ACTIVE') throw badRequest('Only active offers can be paused');
  const updated = await prisma.offer.update({ where: { id: offer.id }, data: { status: 'PAUSED' }, include: { model: { select: { name: true } }, endpoint: { select: { name: true, adapter: true } } } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.offer.paused', targetType: 'offer', targetId: offer.id, ip: clientIp(req) });
  res.json({ offer: serializeOffer(updated) });
});

sellersRouter.delete('/offers/:id', requirePermission('seller:manage'), async (req, res) => {
  const offer = await ownedOffer(req, String(req.params.id));
  await prisma.offer.update({ where: { id: offer.id }, data: { status: 'ARCHIVED' } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.offer.archived', targetType: 'offer', targetId: offer.id, ip: clientIp(req) });
  res.json({ ok: true });
});

sellersRouter.get('/health-log', requirePermission('seller:view'), async (req, res) => {
  const checks = await prisma.offerHealthCheck.findMany({
    where: { offer: { sellerOrgId: req.org!.id } },
    include: { offer: { select: { modelId: true, upstreamModel: true } } },
    orderBy: { checkedAt: 'desc' },
    take: 100,
  });
  res.json({ data: checks.map((c) => ({ ...c, modelId: c.offer.modelId, upstreamModel: c.offer.upstreamModel, offer: undefined })) });
});

// ───────────── Payouts ─────────────

sellersRouter.get('/payouts', requirePermission('seller:view'), async (req, res) => {
  const payouts = await prisma.payout.findMany({ where: { orgId: req.org!.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({
    data: payouts.map((p) => ({ id: p.id, amountUsd: microsToUsd(p.amountMicros), status: p.status, destination: p.destination, externalRef: p.externalRef, note: p.note, createdAt: p.createdAt, processedAt: p.processedAt })),
    payoutProviderConfigured: false,
    notice: 'No payout provider is configured. Payout requests are recorded and funds are reserved, but no money is transferred until an operator processes them.',
  });
});

const payoutSchema = z.object({ amountUsd: z.number().min(1).max(1_000_000), destination: z.string().trim().max(200).optional() });

sellersRouter.post('/payouts', requirePermission('seller:manage'), rateLimit({ name: 'payout', windowSeconds: 3600, max: 5, key: userKey }), async (req, res) => {
  const body = parse(payoutSchema, req.body);
  const payout = await requestPayout(req.org!.id, usdToMicros(body.amountUsd), body.destination ?? null, req.auth!.user.id);
  if (!payout) throw badRequest('Insufficient seller balance for this payout', undefined, 'insufficient_seller_balance');
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'seller.payout.requested', targetType: 'payout', targetId: payout.id, ip: clientIp(req), metadata: { amountUsd: body.amountUsd } });
  await emitEvent({ orgId: req.org!.id, type: 'payout.updated', title: `Payout of $${body.amountUsd.toFixed(2)} requested`, body: 'The payout is awaiting processing.', data: { payout_id: payout.id, status: payout.status, amount_usd: body.amountUsd } });
  res.status(201).json({ payout: { id: payout.id, amountUsd: microsToUsd(payout.amountMicros), status: payout.status, createdAt: payout.createdAt } });
});
