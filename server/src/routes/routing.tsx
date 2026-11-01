import { Router } from 'express';
import { z } from 'zod';
import type { RoutingPolicy } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { pricePerMToUsd, usdPerMToPrice } from '../lib/money.js';
import { parse } from '../middleware/error.js';
import { requireOrg, requirePermission } from '../middleware/org.js';
import { ROUTING_MODES, nexovraOptions, simulateRouting } from '../services/inference.js';
import { audit } from '../services/audit.js';
import { clientIp } from '../services/sessions.js';
import { DEFAULT_POLICY } from '../routing/policy.js';

export const routingRouter = Router();
routingRouter.use(requireOrg());

export function serializePolicy(p: RoutingPolicy) {
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    isDefault: p.isDefault,
    maxInputPriceUsd: pricePerMToUsd(p.maxInputPrice),
    maxOutputPriceUsd: pricePerMToUsd(p.maxOutputPrice),
    minDiscountPct: p.minDiscountPct,
    maxLatencyMs: p.maxLatencyMs,
    minReliability: p.minReliability,
    minQualityScore: p.minQualityScore,
    allowedProviders: p.allowedProviders,
    blockedProviders: p.blockedProviders,
    preferredSellers: p.preferredSellers,
    allowDemoOffers: p.allowDemoOffers,
    maxRetries: p.maxRetries,
    timeoutMs: p.timeoutMs,
    weights: { price: p.weightPrice, latency: p.weightLatency, quality: p.weightQuality, reliability: p.weightReliability },
    updatedAt: p.updatedAt,
  };
}

const list = z.array(z.string().trim().min(1).max(100)).max(50).default([]);
const policySchema = z.object({
  name: z.string().trim().min(1).max(60),
  mode: z.enum(ROUTING_MODES),
  isDefault: z.boolean().default(false),
  maxInputPriceUsd: z.number().min(0).max(10_000).nullish(),
  maxOutputPriceUsd: z.number().min(0).max(10_000).nullish(),
  minDiscountPct: z.number().int().min(0).max(100).nullish(),
  maxLatencyMs: z.number().int().min(50).max(600_000).nullish(),
  minReliability: z.number().int().min(0).max(100).nullish(),
  minQualityScore: z.number().min(0).max(1).nullish(),
  allowedProviders: list,
  blockedProviders: list,
  preferredSellers: list,
  allowDemoOffers: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(5).default(2),
  timeoutMs: z.number().int().min(1000).max(300_000).default(30_000),
  weights: z
    .object({ price: z.number().min(0).max(1), latency: z.number().min(0).max(1), quality: z.number().min(0).max(1), reliability: z.number().min(0).max(1) })
    .refine((w) => w.price + w.latency + w.quality + w.reliability > 0, 'At least one weight must be positive')
    .optional(),
});

function toData(body: z.infer<typeof policySchema>) {
  return {
    name: body.name,
    mode: body.mode,
    isDefault: body.isDefault,
    maxInputPrice: body.maxInputPriceUsd != null ? usdPerMToPrice(body.maxInputPriceUsd) : null,
    maxOutputPrice: body.maxOutputPriceUsd != null ? usdPerMToPrice(body.maxOutputPriceUsd) : null,
    minDiscountPct: body.minDiscountPct ?? null,
    maxLatencyMs: body.maxLatencyMs ?? null,
    minReliability: body.minReliability ?? null,
    minQualityScore: body.minQualityScore ?? null,
    allowedProviders: body.allowedProviders,
    blockedProviders: body.blockedProviders,
    preferredSellers: body.preferredSellers,
    allowDemoOffers: body.allowDemoOffers,
    maxRetries: body.maxRetries,
    timeoutMs: body.timeoutMs,
    ...(body.weights && {
      weightPrice: body.weights.price,
      weightLatency: body.weights.latency,
      weightQuality: body.weights.quality,
      weightReliability: body.weights.reliability,
    }),
  };
}

routingRouter.get('/policies', requirePermission('routing:view'), async (req, res) => {
  const policies = await prisma.routingPolicy.findMany({ where: { orgId: req.org!.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  res.json({
    data: policies.map(serializePolicy),
    platformDefault: { mode: DEFAULT_POLICY.mode, maxRetries: DEFAULT_POLICY.maxRetries, timeoutMs: DEFAULT_POLICY.timeoutMs },
  });
});

routingRouter.post('/policies', requirePermission('routing:manage'), async (req, res) => {
  const body = parse(policySchema, req.body);
  const count = await prisma.routingPolicy.count({ where: { orgId: req.org!.id } });
  if (count >= 25) throw badRequest('At most 25 routing policies per organization');
  const policy = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await tx.routingPolicy.updateMany({ where: { orgId: req.org!.id }, data: { isDefault: false } });
    return tx.routingPolicy.create({ data: { orgId: req.org!.id, ...toData(body), isDefault: body.isDefault || count === 0 } });
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'routing_policy.created', targetType: 'routing_policy', targetId: policy.id, ip: clientIp(req) });
  res.status(201).json({ policy: serializePolicy(policy) });
});

routingRouter.put('/policies/:id', requirePermission('routing:manage'), async (req, res) => {
  const body = parse(policySchema, req.body);
  const existing = await prisma.routingPolicy.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!existing) throw notFound('Policy not found');
  const policy = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await tx.routingPolicy.updateMany({ where: { orgId: req.org!.id, id: { not: existing.id } }, data: { isDefault: false } });
    return tx.routingPolicy.update({ where: { id: existing.id }, data: { ...toData(body), isDefault: body.isDefault || existing.isDefault } });
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'routing_policy.updated', targetType: 'routing_policy', targetId: policy.id, ip: clientIp(req), metadata: { mode: policy.mode } });
  res.json({ policy: serializePolicy(policy) });
});

routingRouter.delete('/policies/:id', requirePermission('routing:manage'), async (req, res) => {
  const existing = await prisma.routingPolicy.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!existing) throw notFound('Policy not found');
  if (existing.isDefault) throw badRequest('Set another policy as default before deleting this one');
  await prisma.routingPolicy.delete({ where: { id: existing.id } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'routing_policy.deleted', targetType: 'routing_policy', targetId: existing.id, ip: clientIp(req) });
  res.json({ ok: true });
});

const simulateSchema = z.object({
  model: z.string().min(1).max(200),
  stream: z.boolean().optional(),
  maxTokens: z.number().int().positive().max(200_000).optional(),
  promptTokens: z.number().int().positive().max(2_000_000).optional(),
  policyId: z.string().max(40).optional(),
  overrides: nexovraOptions.optional(),
});

/** Explain which offers would be selected - no request is sent or billed. */
routingRouter.post('/simulate', requirePermission('routing:view'), async (req, res) => {
  const body = parse(simulateSchema, req.body);
  res.json(await simulateRouting(req.org!.id, body));
});
