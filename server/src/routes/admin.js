import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { microsToUsd } from '../lib/money.js';
import { InferenceError } from '../services/inference.js';
import { runArithmeticBenchmark } from '../services/benchmark.js';
import { parse } from 'zod';

/** Publish benchmark results run through the live pipeline (billed to the admin's current workspace). */
export const adminRouter = Router();
adminRouter.post('/benchmarks/run', async (req, res) => {
  const { modelIds, orgId } = parse(z.object({ modelIds: z.array(z.string()).min(1).max(10), orgId: z.string() }), req.body);
  const member = await prisma.membership.findUnique({ where: { orgId: orgId, userId: req.auth.user.id } });
  if (!member) throw new Error('You must be a member of the billing organization');
  const results = [];
  for (const modelId of modelIds) {
    const r = await runArithmeticBenchmark({ orgId, userId: req.auth.user.id, modelId, isPublic: true });
    results.push({ ok: r.ok, modelId: r.modelId, score: r.ok ? r.result.score : undefined, error: r.ok ? undefined : r.error });
  }
  res.json({ results: results.map((r) => (r.ok ? { ok: true, modelId: r.modelId, score: r.score } : { ok: false, modelId: r.modelId, error: r.error }) ) });
});