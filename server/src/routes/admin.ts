import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { microsToUsd, usdToMicros } from '../lib/money.js';
import { randomBase62 } from '../lib/ids.js';
import { parse } from '../middleware/error.js';
import { requireAdmin } from '../middleware/org.js';
import { creditBalance, failPayout } from '../billing/ledger.js';
import { audit } from '../services/audit.js';
import { emitEvent } from '../services/events.js';
import { clientIp } from '../services/sessions.js';
import { runArithmeticBenchmark } from '../services/benchmark.js';

/** Platform-operator endpoints (User.role = ADMIN, set via ADMIN_EMAILS). */
export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/payouts', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const payouts = await prisma.payout.findMany({
    where: status ? { status: status as never } : {},
    include: { org: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ data: payouts.map((p) => ({ ...p, amountUsd: microsToUsd(p.amountMicros), amountMicros: undefined })) });
});

const payoutUpdate = z.object({
  status: z.enum(['PROCESSING', 'PAID', 'FAILED', 'CANCELLED']),
  externalRef: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

/** Record the outcome of a payout processed outside Nexovra. A PAID status requires an external transfer reference. */
adminRouter.post('/payouts/:id', async (req, res) => {
  const body = parse(payoutUpdate, req.body);
  const payout = await prisma.payout.findUnique({ where: { id: String(req.params.id) } });
  if (!payout) throw notFound('Payout not found');
  if (['PAID', 'FAILED', 'CANCELLED'].includes(payout.status)) throw badRequest('Payout is already final');
  let updated;
  if (body.status === 'FAILED' || body.status === 'CANCELLED') {
    updated = await failPayout(payout.id, body.note ?? body.status.toLowerCase());
  } else {
    if (body.status === 'PAID' && !body.externalRef) throw badRequest('A PAID payout requires the external transfer reference');
    updated = await prisma.$transaction(async (tx) => {
      if (body.status === 'PAID') await tx.billingTransaction.updateMany({ where: { payoutId: payout.id, type: 'PAYOUT' }, data: { status: 'COMPLETED' } });
      return tx.payout.update({
        where: { id: payout.id },
        data: { status: body.status, externalRef: body.externalRef, note: body.note, ...(body.status === 'PAID' && { processedAt: new Date() }) },
      });
    });
  }
  await audit({ orgId: payout.orgId, actorUserId: req.auth!.user.id, action: 'admin.payout.updated', targetType: 'payout', targetId: payout.id, ip: clientIp(req), metadata: body });
  await emitEvent({
    orgId: payout.orgId,
    type: 'payout.updated',
    title: `Payout ${body.status.toLowerCase()}`,
    body: `Payout of $${microsToUsd(payout.amountMicros).toFixed(2)} is now ${body.status.toLowerCase()}.`,
    data: { payout_id: payout.id, status: body.status },
  });
  res.json({ payout: updated });
});

const adjustmentSchema = z.object({
  orgId: z.string().max(40),
  amountUsd: z.number().min(-100_000).max(100_000).refine((v) => v !== 0),
  type: z.enum(['REFUND', 'ADJUSTMENT']),
  reason: z.string().trim().min(3).max(300),
});

adminRouter.post('/adjustments', async (req, res) => {
  const body = parse(adjustmentSchema, req.body);
  if (body.type === 'REFUND' && body.amountUsd < 0) throw badRequest('Refunds must be positive');
  const r = await creditBalance({ orgId: body.orgId, amountMicros: usdToMicros(body.amountUsd), type: body.type, paymentRef: `admin:${randomBase62(16)}`, description: `${body.type === 'REFUND' ? 'Refund' : 'Adjustment'}: ${body.reason}` });
  await audit({ orgId: body.orgId, actorUserId: req.auth!.user.id, action: `admin.${body.type.toLowerCase()}`, ip: clientIp(req), metadata: body });
  res.status(201).json(r);
});

const incidentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
  impact: z.enum(['none', 'minor', 'major', 'critical']),
  body: z.string().trim().min(1).max(5000),
});

adminRouter.post('/incidents', async (req, res) => {
  const body = parse(incidentSchema, req.body);
  const incident = await prisma.incident.create({ data: { ...body, resolvedAt: body.status === 'resolved' ? new Date() : null } });
  await audit({ actorUserId: req.auth!.user.id, action: 'admin.incident.created', targetType: 'incident', targetId: incident.id, ip: clientIp(req) });
  res.status(201).json({ incident });
});

adminRouter.patch('/incidents/:id', async (req, res) => {
  const body = parse(incidentSchema.partial(), req.body);
  const incident = await prisma.incident.update({
    where: { id: String(req.params.id) },
    data: { ...body, ...(body.status === 'resolved' ? { resolvedAt: new Date() } : {}) },
  });
  res.json({ incident });
});

/** Publish benchmark results run through the live pipeline (billed to the admin's current workspace). */
adminRouter.post('/benchmarks/run', async (req, res) => {
  const { modelIds, orgId } = parse(z.object({ modelIds: z.array(z.string()).min(1).max(10), orgId: z.string() }), req.body);
  const member = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: req.auth!.user.id } } });
  if (!member) throw badRequest('You must be a member of the billing organization');
  const results = [];
  for (const modelId of modelIds) results.push(await runArithmeticBenchmark({ orgId, userId: req.auth!.user.id, modelId, isPublic: true }));
  res.json({ results: results.map((r) => (r.ok ? { ok: true, modelId: r.modelId, score: r.result.score } : r)) });
});
