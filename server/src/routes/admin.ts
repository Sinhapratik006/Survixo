import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { microsToUsd } from '../lib/money.js';
import { InferenceError } from '../services/inference.js';
import { runArithmeticBenchmark } from '../services/benchmark.js';
import { requireAdmin } from '../middleware/org.js';
import { audit } from '../services/audit.js';
import { clientIp } from '../services/sessions.js';
import { parse } from 'zod';
import { z } from 'zod';

/** Publish benchmark results run through the live pipeline (billed to the admin's current workspace). */
export const adminRouter = Router();
adminRouter.post('/benchmarks/run', async (req, res) => {
  const { modelIds, orgId } = parse(z.object({ modelIds: z.array(z.string()).min(1).max(10), orgId: z.string() }), req.body);
  const member = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: req.auth!.user.id } } });
  if (!member) throw new Error('You must be a member of the billing organization');
  const results = [];
  for (const modelId of modelIds) {
    const r = await runArithmeticBenchmark({ orgId, userId: req.auth!.user.id, modelId, isPublic: true });
    results.push({ ok: r.ok, modelId: r.modelId, score: r.ok ? r.result.score : undefined, error: r.ok ? undefined : r.error });
  }
  res.json({ results: results.map((r) => (r.ok ? { ok: true, modelId: r.modelId, score: r.score } : { ok: false, modelId: r.modelId, error: r.error }) ) });
});

/**
 * List seller crypto payout accounts so ops can review them before the weekly
 * settlement. Shows the full wallet address (admin-only) — masked elsewhere.
 */
adminRouter.get('/marketplace/payout-accounts', requireAdmin, async (req, res) => {
  const accounts = await prisma.cryptoPayoutAccount.findMany({
    orderBy: { createdAt: 'asc' },
    include: { org: { select: { id: true, name: true } } },
  });
  res.json({
    data: accounts.map((a) => ({
      id: a.id,
      orgId: a.orgId,
      orgName: a.org.name,
      walletAddress: a.walletAddress,
      network: a.network,
      isVerified: a.isVerified,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  });
});

/**
 * Mark a seller's payout wallet as verified (or unverify it). Verification is
 * manual: ops confirms the address is reachable/correct before allowing funds
 * to be released to it.
 */
adminRouter.post('/marketplace/payout-accounts/:id/verify', requireAdmin, async (req, res) => {
  const body = parse(z.object({ isVerified: z.boolean().default(true) }), req.body);
  let account;
  try {
    account = await prisma.cryptoPayoutAccount.update({
      where: { id: req.params.id as string },
      data: { isVerified: body.isVerified },
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') throw notFound('Payout account not found');
    throw err;
  }
  await audit({
    orgId: account.orgId,
    actorUserId: req.auth.user.id,
    action: body.isVerified ? 'marketplace.payout_account.verified' : 'marketplace.payout_account.unverified',
    targetType: 'payout_account',
    targetId: account.id,
    ip: clientIp(req),
    metadata: { network: account.network },
  });
  res.json({ account: { id: account.id, orgId: account.orgId, network: account.network, isVerified: account.isVerified } });
});