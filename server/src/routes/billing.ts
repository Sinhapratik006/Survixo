import express, { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { microsToUsd, nullableMicrosToUsd, usdToMicros } from '../lib/money.js';
import { parse } from '../middleware/error.js';
import { requireOrg, requirePermission } from '../middleware/org.js';
import { rateLimit, userKey } from '../middleware/rateLimit.js';
import { creditBalance } from '../billing/ledger.js';
import { createCheckoutSession, handleStripeEvent, verifyStripeSignature } from '../billing/stripe.js';
import { budgetStatus, orgBudgetScope, projectBudgetScope } from '../services/budget.js';
import { audit } from '../services/audit.js';
import { clientIp } from '../services/sessions.js';
import { logger } from '../lib/logger.js';
import { randomBase62 } from '../lib/ids.js';

export const billingRouter = Router();

/** Stripe webhook: raw body required for signature verification. Mounted before JSON parsing. */
export const stripeWebhookRouter = Router();
stripeWebhookRouter.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (env.BILLING_MODE !== 'stripe' || !env.STRIPE_WEBHOOK_SECRET) return res.status(404).json({ error: { code: 'not_found', message: 'Stripe is not enabled' } });
  const raw = (req.body as Buffer).toString('utf8');
  if (!verifyStripeSignature(raw, req.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))
    return res.status(400).json({ error: { code: 'invalid_signature', message: 'Invalid signature' } });
  try {
    await handleStripeEvent(JSON.parse(raw));
    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, 'stripe webhook handling failed');
    res.status(500).json({ error: { code: 'internal_error', message: 'Webhook handling failed' } });
  }
});

billingRouter.use(requireOrg());

billingRouter.get('/overview', requirePermission('billing:view'), async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.org!.id }, select: { balanceMicros: true, heldMicros: true, sellerBalanceMicros: true } });
  const demoCredit = await prisma.billingTransaction.aggregate({ where: { orgId: req.org!.id, type: 'DEMO_CREDIT' }, _sum: { amountMicros: true } });
  res.json({
    balanceUsd: microsToUsd(org.balanceMicros),
    heldUsd: microsToUsd(org.heldMicros),
    sellerBalanceUsd: microsToUsd(org.sellerBalanceMicros),
    demoCreditUsd: microsToUsd(demoCredit._sum.amountMicros),
    billingMode: env.BILLING_MODE,
    platformFeeBps: env.PLATFORM_FEE_BPS,
    demoCreditCapUsd: DEMO_CREDIT_CAP_USD,
  });
});

const txQuery = z.object({
  account: z.enum(['BUYER', 'SELLER']).optional(),
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

billingRouter.get('/transactions', requirePermission('billing:view'), async (req, res) => {
  const q = parse(txQuery, req.query);
  const rows = await prisma.billingTransaction.findMany({
    where: { orgId: req.org!.id, ...(q.account ? { account: q.account } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, q.limit);
  res.json({
    data: page.map((t) => ({
      id: t.id,
      type: t.type,
      account: t.account,
      status: t.status,
      amountUsd: microsToUsd(t.amountMicros),
      balanceAfterUsd: nullableMicrosToUsd(t.balanceAfterMicros),
      requestId: t.requestId,
      payoutId: t.payoutId,
      description: t.description,
      createdAt: t.createdAt,
    })),
    nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
  });
});

const DEMO_CREDIT_CAP_USD = 100;
const amountSchema = z.object({ amountUsd: z.number().positive() });

/** DEMO BILLING ONLY: adds clearly labelled, non-monetary credit. Disabled when BILLING_MODE=stripe (and in production). */
billingRouter.post(
  '/demo-credit',
  requirePermission('billing:manage'),
  rateLimit({ name: 'demo-credit', windowSeconds: 3600, max: 10, key: userKey }),
  async (req, res) => {
    if (env.BILLING_MODE !== 'demo') throw new HttpError(403, 'demo_billing_disabled', 'Demo credits are disabled on this server.');
    const { amountUsd } = parse(amountSchema.extend({ amountUsd: z.number().positive().max(50) }), req.body);
    const prior = await prisma.billingTransaction.aggregate({ where: { orgId: req.org!.id, type: 'DEMO_CREDIT' }, _sum: { amountMicros: true } });
    if (microsToUsd(prior._sum.amountMicros) + amountUsd > DEMO_CREDIT_CAP_USD)
      throw badRequest(`Demo credit is capped at $${DEMO_CREDIT_CAP_USD} per organization.`, undefined, 'demo_credit_cap');
    await creditBalance({
      orgId: req.org!.id,
      amountMicros: usdToMicros(amountUsd),
      type: 'DEMO_CREDIT',
      paymentRef: `demo:${randomBase62(16)}`,
      description: `Demo credit (not real money) added by ${req.auth!.user.email}`,
    });
    await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'billing.demo_credit', ip: clientIp(req), metadata: { amountUsd } });
    res.status(201).json({ ok: true });
  },
);

billingRouter.post('/checkout', requirePermission('billing:manage'), async (req, res) => {
  if (env.BILLING_MODE !== 'stripe') throw new HttpError(409, 'payments_not_configured', 'Card payments are not configured on this server (BILLING_MODE=demo).');
  const { amountUsd } = parse(amountSchema.extend({ amountUsd: z.number().min(5).max(5000) }), req.body);
  const session = await createCheckoutSession({ orgId: req.org!.id, amountCents: Math.round(amountUsd * 100), email: req.auth!.user.email, userId: req.auth!.user.id });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'billing.checkout_started', ip: clientIp(req), metadata: { amountUsd, sessionId: session.id } });
  res.json({ url: session.url });
});

// ───────────── Smart Budget Guard ─────────────

const budgetSchema = z.object({
  projectId: z.string().max(40).nullish(),
  dailyLimitUsd: z.number().positive().max(1_000_000).nullish(),
  monthlyLimitUsd: z.number().positive().max(10_000_000).nullish(),
  maxPerRequestUsd: z.number().positive().max(10_000).nullish(),
  maxPerTaskUsd: z.number().positive().max(100_000).nullish(),
  alertThresholds: z.array(z.number().int().min(1).max(100)).max(6).default([50, 80, 100]),
  hardLimit: z.boolean().default(true),
});

function serializeBudget(b: Awaited<ReturnType<typeof prisma.budget.findUnique>>) {
  if (!b) return null;
  return {
    id: b.id,
    projectId: b.projectId,
    dailyLimitUsd: nullableMicrosToUsd(b.dailyLimitMicros),
    monthlyLimitUsd: nullableMicrosToUsd(b.monthlyLimitMicros),
    maxPerRequestUsd: nullableMicrosToUsd(b.maxPerRequestMicros),
    maxPerTaskUsd: nullableMicrosToUsd(b.maxPerTaskMicros),
    alertThresholds: b.alertThresholds,
    hardLimit: b.hardLimit,
    updatedAt: b.updatedAt,
  };
}

billingRouter.get('/budget', requirePermission('billing:view'), async (req, res) => {
  const status = await budgetStatus(req.org!.id);
  const projectBudgets = await prisma.budget.findMany({ where: { orgId: req.org!.id, projectId: { not: null } }, include: { project: { select: { name: true } } } });
  res.json({
    budget: serializeBudget(status.budget),
    daySpentUsd: microsToUsd(status.daySpentMicros),
    monthSpentUsd: microsToUsd(status.monthSpentMicros),
    inFlightUsd: microsToUsd(status.inFlightMicros),
    projectBudgets: projectBudgets.map((b) => ({ ...serializeBudget(b), projectName: b.project?.name })),
    notes: {
      inFlight: 'Requests already in flight hold their worst-case cost; they can still complete and be charged after a limit is reached.',
      enforcement: 'Hard limits are checked before each request using the worst-case reserved cost.',
    },
  });
});

billingRouter.put('/budget', requirePermission('budget:manage'), async (req, res) => {
  const body = parse(budgetSchema, req.body);
  if (body.projectId) {
    const p = await prisma.project.findFirst({ where: { id: body.projectId, orgId: req.org!.id } });
    if (!p) throw badRequest('Project not found');
  }
  const scopeKey = body.projectId ? projectBudgetScope(body.projectId) : orgBudgetScope(req.org!.id);
  const data = {
    dailyLimitMicros: body.dailyLimitUsd ? usdToMicros(body.dailyLimitUsd) : null,
    monthlyLimitMicros: body.monthlyLimitUsd ? usdToMicros(body.monthlyLimitUsd) : null,
    maxPerRequestMicros: body.maxPerRequestUsd ? usdToMicros(body.maxPerRequestUsd) : null,
    maxPerTaskMicros: body.maxPerTaskUsd ? usdToMicros(body.maxPerTaskUsd) : null,
    alertThresholds: [...new Set(body.alertThresholds)].sort((a, b) => a - b),
    hardLimit: body.hardLimit,
  };
  const budget = await prisma.budget.upsert({
    where: { scopeKey },
    create: { orgId: req.org!.id, projectId: body.projectId ?? null, scopeKey, ...data },
    update: data,
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'budget.updated', targetType: 'budget', targetId: budget.id, ip: clientIp(req), metadata: body as never });
  res.json({ budget: serializeBudget(budget) });
});

billingRouter.delete('/budget/:id', requirePermission('budget:manage'), async (req, res) => {
  const r = await prisma.budget.deleteMany({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (r.count) await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'budget.deleted', targetType: 'budget', targetId: String(req.params.id), ip: clientIp(req) });
  res.json({ ok: true });
});
