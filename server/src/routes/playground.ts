import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { microsToUsd } from '../lib/money.js';
import { sha256Hex } from '../security/crypto.js';
import { createSseSink } from '../lib/sse.js';
import { parse } from '../middleware/error.js';
import { requireOrg, requirePermission } from '../middleware/org.js';
import { rateLimit, userKey } from '../middleware/rateLimit.js';
import { InferenceError, runChatCompletion } from '../services/inference.js';
import { recommendModels } from '../services/modelMatch.js';
import { analyzeUsage } from '../services/optimizer.js';
import { runArithmeticBenchmark } from '../services/benchmark.js';
import { audit } from '../services/audit.js';
import { clientIp } from '../services/sessions.js';

export const playgroundRouter = Router();
playgroundRouter.use(requireOrg());

const inferenceLimiter = rateLimit({ name: 'playground', windowSeconds: 60, max: 40, key: userKey });

/** Playground chat: same pipeline and billing as the public API, authenticated by session. */
playgroundRouter.post('/chat', requirePermission('inference:use'), inferenceLimiter, async (req, res) => {
  const ctx = { orgId: req.org!.id, userId: req.auth!.user.id, source: 'PLAYGROUND' as const };
  if (req.body?.stream === true) {
    const sink = createSseSink(req, res);
    try {
      await runChatCompletion(ctx, req.body, sink);
    } catch (err) {
      if (!res.headersSent) throw err;
      const e = err instanceof InferenceError ? err : new InferenceError(500, 'internal_error', 'Stream failed');
      sink.send({ error: { message: e.message, code: e.code, request_id: e.requestId } });
      sink.end();
    }
    return;
  }
  const result = await runChatCompletion(ctx, req.body);
  res.json(result!.body);
});

// ───────────── Model Arena ─────────────

const arenaSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  system: z.string().max(4000).optional(),
  modelIds: z.array(z.string().min(1).max(200)).min(2).max(4),
  maxTokens: z.number().int().min(16).max(4096).default(512),
  criteria: z.array(z.string().trim().min(1).max(40)).max(6).default(['Accuracy', 'Helpfulness', 'Format']),
  consent: z.literal(true, { message: 'You must confirm that this prompt may be sent to multiple providers.' }),
});

playgroundRouter.post('/arena/run', requirePermission('inference:use'), inferenceLimiter, async (req, res) => {
  const body = parse(arenaSchema, req.body);
  if (new Set(body.modelIds).size !== body.modelIds.length) throw badRequest('Choose distinct models');
  const session = await prisma.arenaSession.create({
    data: { orgId: req.org!.id, userId: req.auth!.user.id, promptHash: sha256Hex(body.prompt), promptChars: body.prompt.length, criteria: body.criteria },
  });
  const messages = [...(body.system ? [{ role: 'system', content: body.system }] : []), { role: 'user', content: body.prompt }];
  const results = await Promise.all(
    body.modelIds.map(async (modelId) => {
      const started = Date.now();
      try {
        const r = await runChatCompletion(
          { orgId: req.org!.id, userId: req.auth!.user.id, source: 'ARENA' },
          { model: modelId, messages, max_tokens: body.maxTokens },
        );
        await prisma.arenaEntry.create({ data: { sessionId: session.id, requestId: r!.requestId, modelId: r!.meta.model } });
        return { modelId, ok: true as const, requestId: r!.requestId, content: r!.content, usage: r!.usage, meta: r!.meta };
      } catch (err) {
        const e = err instanceof InferenceError ? err : null;
        return {
          modelId,
          ok: false as const,
          requestId: e?.requestId ?? null,
          error: { code: e?.code ?? 'internal_error', message: e?.message ?? 'Request failed' },
          latencyMs: Date.now() - started,
        };
      }
    }),
  );
  res.json({ sessionId: session.id, criteria: body.criteria, results });
});

const ratingSchema = z.object({
  ratings: z
    .array(
      z.object({
        requestId: z.string().max(60),
        rating: z.number().int().min(1).max(5),
        scores: z.record(z.string().max(40), z.number().int().min(1).max(5)).optional(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .min(1)
    .max(4),
});

playgroundRouter.post('/arena/:sessionId/ratings', requirePermission('inference:use'), async (req, res) => {
  const body = parse(ratingSchema, req.body);
  const session = await prisma.arenaSession.findFirst({ where: { id: String(req.params.sessionId), orgId: req.org!.id } });
  if (!session) throw notFound('Arena session not found');
  for (const r of body.ratings) {
    await prisma.arenaEntry.updateMany({
      where: { sessionId: session.id, requestId: r.requestId },
      data: { rating: r.rating, scores: r.scores ?? undefined, notes: r.notes },
    });
  }
  res.json({ ok: true });
});

playgroundRouter.get('/arena/history', requirePermission('usage:view'), async (req, res) => {
  const sessions = await prisma.arenaSession.findMany({
    where: { orgId: req.org!.id },
    include: { entries: { include: { request: { select: { costMicros: true, latencyMs: true, outputTokens: true, status: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json({
    data: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      promptChars: s.promptChars,
      criteria: s.criteria,
      entries: s.entries.map((e) => ({
        modelId: e.modelId,
        requestId: e.requestId,
        rating: e.rating,
        scores: e.scores,
        costUsd: microsToUsd(e.request.costMicros),
        latencyMs: e.request.latencyMs,
        outputTokens: e.request.outputTokens,
      })),
    })),
  });
});

// ───────────── Model Match Assistant ─────────────

const matchSchema = z.object({
  task: z.string().trim().min(5).max(2000),
  requiredCapabilities: z.array(z.enum(['tools', 'vision', 'json_mode', 'streaming'])).max(4).optional(),
  maxOutputPriceUsd: z.number().positive().max(10_000).optional(),
  maxLatencyMs: z.number().int().positive().max(600_000).optional(),
});

playgroundRouter.post('/assistant/match', requirePermission('usage:view'), async (req, res) => {
  res.json(await recommendModels(parse(matchSchema, req.body)));
});

// ───────────── Cost Optimizer ─────────────

playgroundRouter.get('/optimizer', requirePermission('usage:view'), async (req, res) => {
  res.json(await analyzeUsage(req.org!.id));
});

const applySchema = z.object({
  recommendationId: z.string().max(40),
  action: z.object({ kind: z.literal('apply_routing_mode'), policyId: z.string().max(40), mode: z.enum(['LOWEST_COST', 'BALANCED']) }),
  confirm: z.literal(true, { message: 'Explicit confirmation is required to change routing settings.' }),
});

playgroundRouter.post('/optimizer/apply', requirePermission('routing:manage'), async (req, res) => {
  const body = parse(applySchema, req.body);
  const analysis = await analyzeUsage(req.org!.id);
  const rec = analysis.recommendations.find((r) => r.id === body.recommendationId);
  if (!rec || rec.action?.kind !== 'apply_routing_mode' || rec.action.policyId !== body.action.policyId || rec.action.mode !== body.action.mode)
    throw badRequest('This recommendation is no longer current. Refresh and review it again.', undefined, 'stale_recommendation');
  const policy = await prisma.routingPolicy.findFirst({ where: { id: body.action.policyId, orgId: req.org!.id } });
  if (!policy) throw notFound('Policy not found');
  const updated = await prisma.routingPolicy.update({ where: { id: policy.id }, data: { mode: body.action.mode } });
  await audit({
    orgId: req.org!.id,
    actorUserId: req.auth!.user.id,
    action: 'optimizer.applied',
    targetType: 'routing_policy',
    targetId: policy.id,
    ip: clientIp(req),
    metadata: { from: policy.mode, to: updated.mode, recommendationId: rec.id },
  });
  res.json({ ok: true, policy: { id: updated.id, mode: updated.mode } });
});

// ───────────── Benchmarks (private runs) ─────────────

const benchSchema = z.object({ modelIds: z.array(z.string().min(1).max(200)).min(1).max(4) });

playgroundRouter.post(
  '/benchmarks/run',
  requirePermission('inference:use'),
  rateLimit({ name: 'benchmark', windowSeconds: 3600, max: 6, key: userKey }),
  async (req, res) => {
    const body = parse(benchSchema, req.body);
    const results = [];
    for (const modelId of body.modelIds) {
      results.push(await runArithmeticBenchmark({ orgId: req.org!.id, userId: req.auth!.user.id, modelId, isPublic: false }));
    }
    res.json({
      results: results.map((r) => (r.ok ? { ok: true, modelId: r.modelId, result: { ...r.result, costUsd: microsToUsd(r.result.costMicros), costMicros: undefined } } : r)),
    });
  },
);

playgroundRouter.get('/benchmarks/mine', requirePermission('usage:view'), async (req, res) => {
  const rows = await prisma.benchmarkResult.findMany({ where: { runByOrgId: req.org!.id }, include: { model: { select: { name: true } } }, orderBy: { runAt: 'desc' }, take: 50 });
  res.json({ data: rows.map((b) => ({ ...b, modelName: b.model.name, model: undefined, costUsd: microsToUsd(b.costMicros), costMicros: undefined })) });
});
