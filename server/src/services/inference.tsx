import type { Prisma, RequestSource } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { store } from '../lib/store.js';
import { logger } from '../lib/logger.js';
import { requestId as newRequestId } from '../lib/ids.js';
import { feeSplit, microsToUsd, minBig, nullableMicrosToUsd, tokenCostMicros, usdToMicros } from '../lib/money.js';
import { redactDeep, sanitizeUpstreamError } from '../security/redact.js';
import { getAdapter } from '../providers/registry.js';
import { AdapterError, type ChatMessage, type UpstreamChatRequest, type UsageInfo } from '../providers/types.js';
import { rankCandidates, summarizeRejections, type RankedCandidate, type RoutingDecision } from '../routing/engine.js';
import { inflightKey, loadCandidates, rpmKey } from '../routing/candidates.js';
import { mergeConstraints, resolvePolicy } from '../routing/policy.js';
import { estimatePromptTokens, estimateTextTokens } from '../routing/tokens.js';
import { placeHold, releaseHold, settleFailure, settleSuccess } from '../billing/ledger.js';
import { enforceBudgets, evaluateBudgetAlerts, getBudgets, perRequestCap } from './budget.js';
import { loadEndpointCredential } from './credentials.js';
import { markOfferFailure, markOfferSuccess } from './offerHealth.js';
import { emitEvent } from './events.js';

// ───────────────────────────── Request schema ─────────────────────────────

const contentPart = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(1_000_000) }),
  z.object({
    type: z.literal('image_url'),
    image_url: z.object({ url: z.string().max(10_000_000), detail: z.string().optional() }),
  }),
]);

const message = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool', 'developer']),
  content: z.union([z.string().max(1_000_000), z.array(contentPart).max(100), z.null()]),
  name: z.string().max(128).optional(),
  tool_calls: z.array(z.unknown()).max(128).optional(),
  tool_call_id: z.string().max(256).optional(),
});

export const ROUTING_MODES = ['LOWEST_COST', 'BALANCED', 'QUALITY_FIRST', 'PREFERRED_PROVIDER', 'CUSTOM'] as const;
const routingModeInput = z
  .string()
  .transform((v) => v.toUpperCase().replace(/-/g, '_'))
  .pipe(z.enum(ROUTING_MODES));

export const nexovraOptions = z
  .object({
    routing_mode: routingModeInput.optional(),
    policy_id: z.string().max(64).optional(),
    max_cost_usd: z.number().positive().max(10_000).optional(),
    min_discount_pct: z.number().min(0).max(100).optional(),
    max_latency_ms: z.number().int().positive().max(600_000).optional(),
    min_reliability: z.number().int().min(0).max(100).optional(),
    min_quality_score: z.number().min(0).max(1).optional(),
    allowed_providers: z.array(z.string().max(100)).max(50).optional(),
    blocked_providers: z.array(z.string().max(100)).max(50).optional(),
    preferred_providers: z.array(z.string().max(100)).max(50).optional(),
    required_capabilities: z.array(z.enum(['tools', 'vision', 'json_mode', 'streaming'])).max(10).optional(),
    task_id: z.string().max(128).optional(),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    model: z.string().min(1).max(200),
    messages: z.array(message).min(1).max(1000),
    stream: z.boolean().optional(),
    stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
    max_tokens: z.number().int().positive().max(1_000_000).optional(),
    max_completion_tokens: z.number().int().positive().max(1_000_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    stop: z.union([z.string().max(200), z.array(z.string().max(200)).max(4)]).optional(),
    seed: z.number().int().optional(),
    n: z.number().int().optional(),
    tools: z.array(z.unknown()).max(128).optional(),
    tool_choice: z.unknown().optional(),
    response_format: z.object({ type: z.enum(['text', 'json_object', 'json_schema']) }).passthrough().optional(),
    user: z.string().max(256).optional(),
    nexovra: nexovraOptions.optional(),
  })
  .passthrough();

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

// ───────────────────────────── Types ─────────────────────────────

export class InferenceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
    public requestId?: string,
  ) {
    super(message);
  }
}

export interface InferenceContext {
  orgId: string;
  userId?: string | null;
  apiKey?: { id: string; spendLimitMicros: bigint | null; spentMicros: bigint; projectId: string | null } | null;
  projectId?: string | null;
  source: RequestSource;
  idempotencyKey?: string | null;
  headerRoutingMode?: string | null;
  headerMinDiscount?: string | null;
  headerTaskId?: string | null;
}

/** Transport used to stream SSE events to the client. */
export interface StreamSink {
  start(headers: Record<string, string>): void;
  send(data: unknown): void;
  end(): void;
  isClosed(): boolean;
  onClose(cb: () => void): void;
}

export interface NexovraMeta {
  request_id: string;
  model: string;
  offer_id: string;
  seller: string;
  demo: boolean;
  routing_mode: string;
  routing_reason: string;
  retries: number;
  cost_usd: number;
  baseline_cost_usd: number | null;
  estimated_savings_usd: number | null;
  usage_estimated: boolean;
  latency_ms: number;
}

export interface CompletionResult {
  requestId: string;
  body: Record<string, unknown>;
  meta: NexovraMeta;
  content: string | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function idempotencyConflict() {
  return new InferenceError(409, 'idempotency_conflict', 'A request with this Idempotency-Key is already being processed or was processed; it was not executed or billed again.');
}

export const DEFAULT_MAX_TOKENS = 4096;
const INPUT_ESTIMATE_MARGIN = 1.25;
const MIN_OUTPUT_TOKENS_UNDER_CAP = 16;

// ───────────────────────────── Helpers ─────────────────────────────

function deriveRequirements(body: ChatRequestBody) {
  const caps = new Set<string>(['chat', ...(body.nexovra?.required_capabilities ?? [])]);
  if (body.stream) caps.add('streaming');
  if (body.tools?.length) caps.add('tools');
  if (body.response_format && body.response_format.type !== 'text') caps.add('json_mode');
  const hasImage = body.messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'));
  if (hasImage) caps.add('vision');
  return { capabilities: [...caps], inputModalities: hasImage ? ['text', 'image'] : ['text'] };
}

async function resolveModels(requested: string) {
  if (requested.toLowerCase() === 'auto') {
    const models = await prisma.model.findMany({ where: { apiSupported: true, capabilities: { some: { capability: 'chat' } } }, select: { id: true, maxOutputTokens: true } });
    return { auto: true, models };
  }
  const model = await prisma.model.findFirst({
    where: { OR: [{ id: { equals: requested, mode: 'insensitive' } }, { aliases: { has: requested.toLowerCase() } }] },
    select: { id: true, apiSupported: true, maxOutputTokens: true, name: true },
  });
  if (!model) throw new InferenceError(404, 'model_not_found', `Model "${requested}" is not in the Nexovra catalog. List models with GET /v1/models.`);
  if (!model.apiSupported)
    throw new InferenceError(400, 'unsupported_model', `"${model.id}" is listed in the catalog but is not yet available through the chat completions API.`);
  return { auto: false, models: [model] };
}

function traceFor(decision: RoutingDecision, extra: Record<string, unknown>): Prisma.InputJsonValue {
  return {
    mode: decision.mode,
    explanation: decision.explanation,
    ranked: decision.ranked.slice(0, 8).map((r) => ({
      offer_id: r.candidate.offerId,
      model: r.candidate.modelId,
      seller: r.candidate.sellerName,
      demo: r.candidate.isDemo,
      est_cost_usd: microsToUsd(r.estCostMicros),
      baseline_est_usd: nullableMicrosToUsd(r.baselineCostMicros),
      discount_pct: r.discountPct === null ? null : Number(r.discountPct.toFixed(2)),
      p50_latency_ms: r.candidate.stats.p50LatencyMs,
      reliability: r.candidate.reliabilityScore,
      quality: r.candidate.qualityScore,
    })),
    rejected: decision.rejected.slice(0, 30).map((r) => ({ offer_id: r.offerId, model: r.modelId, seller: r.sellerName, reasons: r.reasons })),
    ...extra,
  } as Prisma.InputJsonValue;
}

function toUpstream(body: ChatRequestBody, upstreamModel: string, maxTokens: number): UpstreamChatRequest {
  return {
    model: upstreamModel,
    messages: body.messages as ChatMessage[],
    max_tokens: maxTokens,
    ...(body.temperature !== undefined && { temperature: body.temperature }),
    ...(body.top_p !== undefined && { top_p: body.top_p }),
    ...(body.stop !== undefined && { stop: body.stop }),
    ...(body.seed !== undefined && { seed: body.seed }),
    ...(body.tools?.length && { tools: body.tools }),
    ...(body.tool_choice !== undefined && { tool_choice: body.tool_choice }),
    ...(body.response_format && { response_format: body.response_format }),
  };
}

interface Attempt {
  ranked: RankedCandidate;
  maxTokens: number;
  holdMicros: bigint;
}

// ───────────────────────────── Pipeline ─────────────────────────────

/**
 * Execute an OpenAI-compatible chat completion through the marketplace:
 * validate → resolve policy & model → rank eligible offers → enforce budgets
 * → reserve funds → call adapters with bounded failover → settle billing
 * exactly once → record a request trace.
 *
 * With a `sink`, the response is streamed and the function resolves once the
 * stream has ended. Without one, the completion body is returned.
 */
export async function runChatCompletion(ctx: InferenceContext, rawBody: unknown, sink?: StreamSink): Promise<CompletionResult | null> {
  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new InferenceError(400, 'invalid_request', `Invalid request: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim(), {
      issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const body = parsed.data;
  if (body.n !== undefined && body.n !== 1) throw new InferenceError(400, 'unsupported_parameter', 'Only n=1 is supported.');
  if (Boolean(body.stream) !== Boolean(sink)) throw new InferenceError(400, 'invalid_request', 'Streaming transport mismatch.');

  const opts = { ...(body.nexovra ?? {}) };
  if (!opts.routing_mode && ctx.headerRoutingMode) {
    const m = routingModeInput.safeParse(ctx.headerRoutingMode);
    if (!m.success) throw new InferenceError(400, 'invalid_routing_mode', `Unknown routing mode "${ctx.headerRoutingMode}".`);
    opts.routing_mode = m.data;
  }
  if (ctx.headerMinDiscount) {
    const v = Number(ctx.headerMinDiscount);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new InferenceError(400, 'invalid_request', 'X-Min-Discount must be a number between 0 and 100.');
    opts.min_discount_pct = Math.max(opts.min_discount_pct ?? 0, v);
  }
  const taskId = opts.task_id ?? ctx.headerTaskId ?? null;
  const projectId = ctx.projectId ?? ctx.apiKey?.projectId ?? null;

  if (ctx.idempotencyKey) {
    const existing = await prisma.inferenceRequest.findUnique({
      where: { orgId_idempotencyKey: { orgId: ctx.orgId, idempotencyKey: ctx.idempotencyKey } },
      select: { id: true, status: true },
    });
    if (existing)
      throw new InferenceError(409, 'idempotency_conflict', 'A request with this Idempotency-Key was already processed; it was not executed or billed again.', {
        original_request_id: existing.id,
        original_status: existing.status,
      });
  }

  const [policy, resolved] = await Promise.all([resolvePolicy(ctx.orgId, projectId, opts.policy_id), resolveModels(body.model)]);
  const req = deriveRequirements(body);
  const estIn = estimatePromptTokens(body.messages as ChatMessage[]);
  const requestedMax = body.max_tokens ?? body.max_completion_tokens;
  const modelMax = resolved.models.length === 1 ? resolved.models[0]!.maxOutputTokens : null;
  const maxTokens = Math.min(requestedMax ?? DEFAULT_MAX_TOKENS, modelMax ?? Number.MAX_SAFE_INTEGER);

  const constraints = mergeConstraints(policy, opts, {
    requiredCapabilities: req.capabilities,
    requiredInputModalities: req.inputModalities,
    estInputTokens: estIn,
    estOutputTokens: maxTokens,
  });

  const candidates = await loadCandidates(resolved.models.map((m) => m.id));
  const decision = rankCandidates(candidates, constraints);
  const id = newRequestId();
  const startedAt = Date.now();
  const baseRecord = {
    id,
    orgId: ctx.orgId,
    apiKeyId: ctx.apiKey?.id ?? null,
    userId: ctx.userId ?? null,
    projectId,
    requestedModel: body.model,
    routingMode: constraints.mode,
    stream: Boolean(body.stream),
    idempotencyKey: ctx.idempotencyKey ?? null,
    taskId,
    source: ctx.source,
  };

  const reject = async (
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    modelId?: string | null,
  ): Promise<never> => {
    try {
      await prisma.inferenceRequest.create({
        data: {
          ...baseRecord,
          modelId: modelId ?? (resolved.auto ? null : resolved.models[0]!.id),
          status: 'REJECTED',
          httpStatus: status,
          errorCode: code,
          errorMessage: message,
          routingTrace: traceFor(decision, { constraints: summarizeConstraints(constraints) }),
          completedAt: new Date(),
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw idempotencyConflict();
      throw err;
    }
    throw new InferenceError(status, code, message, details, id);
  };

  if (!decision.ranked.length) {
    if (!candidates.length)
      await reject(404, 'no_offers_for_model', `No seller currently offers "${body.model}".`);
    await reject(503, 'no_eligible_offer', `No eligible offer satisfies this request's constraints. ${summarizeRejections(decision.rejected)}`, {
      rejected: decision.rejected.slice(0, 10),
    });
  }

  // Per-request cost cap (Agent Mode `max_cost_usd` and/or budget max-per-request): cap max_tokens per offer.
  const budgets = await getBudgets(ctx.orgId, projectId);
  const caps = [opts.max_cost_usd !== undefined ? usdToMicros(opts.max_cost_usd) : null, perRequestCap(budgets)].filter(
    (v): v is bigint => v !== null,
  );
  const costCap = caps.length ? caps.reduce((a, b) => (a < b ? a : b)) : null;
  const holdInputTokens = Math.ceil(estIn * INPUT_ESTIMATE_MARGIN);
  const attempts: Attempt[] = [];
  const capRejected: string[] = [];
  for (const r of decision.ranked) {
    if (attempts.length >= policy.maxRetries + 1) break;
    // With model "auto", each candidate model has its own output limit.
    let tokens = Math.min(maxTokens, r.candidate.maxOutputTokens ?? maxTokens);
    if (costCap !== null) {
      const inputCost = tokenCostMicros(holdInputTokens, 0, r.candidate.inputPrice, r.candidate.outputPrice);
      const remaining = costCap - inputCost;
      const allowed = r.candidate.outputPrice > 0 ? Number((remaining * 1_000_000n) / BigInt(r.candidate.outputPrice)) : tokens;
      if (remaining <= 0n || allowed < MIN_OUTPUT_TOKENS_UNDER_CAP) {
        capRejected.push(r.candidate.offerId);
        continue;
      }
      tokens = Math.min(tokens, allowed);
    }
    attempts.push({
      ranked: r,
      maxTokens: tokens,
      holdMicros: tokenCostMicros(holdInputTokens, tokens, r.candidate.inputPrice, r.candidate.outputPrice),
    });
  }
  if (!attempts.length)
    await reject(402, 'max_cost_too_low', 'The maximum cost for this request is too low to cover the prompt on any eligible offer.', {
      max_cost_usd: costCap !== null ? microsToUsd(costCap) : null,
      offers_considered: capRejected.length,
    });

  const holdMicros = attempts.reduce((m, a) => (a.holdMicros > m ? a.holdMicros : m), 0n);
  try {
    await enforceBudgets({ orgId: ctx.orgId, projectId, apiKey: ctx.apiKey ?? null, taskId, estimateMicros: holdMicros, budgets });
  } catch (err) {
    const e = err as { status: number; code: string; message: string; details?: Record<string, unknown> };
    await reject(e.status ?? 402, e.code ?? 'budget_exceeded', e.message, e.details);
  }
  if (!(await placeHold(ctx.orgId, holdMicros))) {
    const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { balanceMicros: true } });
    await reject(402, 'insufficient_balance', 'Insufficient balance to reserve the worst-case cost of this request.', {
      required_hold_usd: microsToUsd(holdMicros),
      available_usd: microsToUsd(org?.balanceMicros ?? 0n),
    });
  }

  const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { promptRetention: true } });
  const retentionDays = org?.promptRetention === 'REDACTED_7D' ? 7 : org?.promptRetention === 'REDACTED_30D' ? 30 : 0;

  await prisma.inferenceRequest
    .create({
    data: {
      ...baseRecord,
      modelId: attempts[0]!.ranked.candidate.modelId,
      holdMicros,
      isDemo: attempts[0]!.ranked.candidate.isDemo,
      routingTrace: traceFor(decision, {
        constraints: summarizeConstraints(constraints),
        estimates: { input_tokens: estIn, max_output_tokens: maxTokens, hold_usd: microsToUsd(holdMicros) },
        policy: { id: policy.id, name: policy.name, max_retries: policy.maxRetries },
      }),
      ...(retentionDays
        ? {
            payload: redactDeep({ messages: body.messages, params: { max_tokens: requestedMax, temperature: body.temperature, top_p: body.top_p } }) as Prisma.InputJsonValue,
            payloadExpiresAt: new Date(Date.now() + retentionDays * 86_400_000),
          }
        : {}),
    },
    })
    .catch(async (err) => {
      // A concurrent request with the same Idempotency-Key won the race: release our hold.
      await releaseHold(ctx.orgId, holdMicros);
      if (isUniqueViolation(err)) throw idempotencyConflict();
      throw err;
    });

  const endpoints = new Map(
    (
      await prisma.sellerEndpoint.findMany({
        where: { id: { in: [...new Set(attempts.map((a) => a.ranked.candidate.endpointId))] } },
        select: { id: true, baseUrl: true, config: true },
      })
    ).map((e) => [e.id, e]),
  );

  let lastError: AdapterError | null = null;
  let retryCount = 0;
  let dispatched = 0;
  const failureLog: Array<{ offer_id: string; seller: string; error: string }> = [];
  let streamStarted = false;
  const clientAbort = new AbortController();
  sink?.onClose(() => clientAbort.abort(new Error('client disconnected')));

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]!;
    const c = attempt.ranked.candidate;
    if (clientAbort.signal.aborted) break;

    const inflight = await store.incr(inflightKey(c.offerId), 600);
    if (inflight > c.maxConcurrency) {
      await store.decr(inflightKey(c.offerId));
      failureLog.push({ offer_id: c.offerId, seller: c.sellerName, error: 'capacity: concurrency limit reached' });
      continue;
    }
    await store.incr(rpmKey(c.offerId), 120);
    // Retries count upstream dispatches after the first, not offers skipped for capacity.
    if (dispatched > 0) retryCount++;
    dispatched++;

    const endpoint = endpoints.get(c.endpointId);
    const timeoutMs = Math.min(c.timeoutMs, policy.timeoutMs);
    const attemptStart = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const onClientAbort = () => controller.abort(new Error('client disconnected'));
    clientAbort.signal.addEventListener('abort', onClientAbort, { once: true });

    let content = '';
    let toolCalls: unknown[] | undefined;
    let finishReason = 'stop';
    let usage: UsageInfo | undefined;
    let ttftMs: number | null = null;

    try {
      if (!endpoint) throw new AdapterError('network', 'Endpoint not found');
      const adapter = getAdapter(c.adapter);
      const apiKey = await loadEndpointCredential(c.endpointId);
      const upstreamReq = toUpstream(body, c.upstreamModel, attempt.maxTokens);
      const actx = { baseUrl: endpoint.baseUrl, apiKey, config: endpoint.config as Record<string, unknown> | null, signal: controller.signal };

      if (!sink) {
        const result = await adapter.chat(upstreamReq, actx);
        content = result.content ?? '';
        toolCalls = result.toolCalls;
        finishReason = result.finishReason;
        usage = result.usage;
      } else {
        const created = Math.floor(Date.now() / 1000);
        const base = { id: `chatcmpl-${id}`, object: 'chat.completion.chunk', created, model: c.modelId };
        for await (const chunk of adapter.chatStream(upstreamReq, actx)) {
          if (!streamStarted && (chunk.content || chunk.toolCalls || chunk.finishReason)) {
            streamStarted = true;
            ttftMs = Date.now() - attemptStart;
            sink.start({ 'x-nexovra-request-id': id, 'x-nexovra-offer-id': c.offerId });
            sink.send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] });
          }
          if (chunk.content) {
            content += chunk.content;
            sink.send({ ...base, choices: [{ index: 0, delta: { content: chunk.content }, finish_reason: null }] });
          }
          if (chunk.toolCalls) {
            toolCalls = [...(toolCalls ?? []), ...chunk.toolCalls];
            sink.send({ ...base, choices: [{ index: 0, delta: { tool_calls: chunk.toolCalls }, finish_reason: null }] });
          }
          if (chunk.finishReason) finishReason = chunk.finishReason;
          if (chunk.usage) usage = chunk.usage;
        }
        if (!streamStarted) throw new AdapterError('bad_response', 'Upstream stream ended without content');
        sink.send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] });
      }

      clearTimeout(timer);
      const latencyMs = Date.now() - attemptStart;
      await prisma.requestAttempt.create({ data: { requestId: id, offerId: c.offerId, attempt: i + 1, ok: true, latencyMs } });
      await markOfferSuccess(c.offerId);

      // The demo adapter reports heuristic token counts, so they are flagged as estimates too.
      const usageEstimated = !usage || c.adapter === 'demo';
      const inputTokens = usage?.prompt_tokens ?? estIn;
      const outputTokens = usage?.completion_tokens ?? estimateTextTokens(content + (toolCalls ? JSON.stringify(toolCalls) : ''));
      // Charges never exceed the funds reserved before dispatch.
      const cost = minBig(tokenCostMicros(inputTokens, outputTokens, c.inputPrice, c.outputPrice), holdMicros);
      const { fee, seller } = feeSplit(cost, env.PLATFORM_FEE_BPS);
      const baseline =
        c.baselineInputPrice !== null && c.baselineOutputPrice !== null
          ? tokenCostMicros(inputTokens, outputTokens, c.baselineInputPrice, c.baselineOutputPrice)
          : null;
      const totalLatency = Date.now() - startedAt;

      await settleSuccess({
        requestId: id,
        orgId: ctx.orgId,
        apiKeyId: ctx.apiKey?.id ?? null,
        modelId: c.modelId,
        offerId: c.offerId,
        sellerOrgId: c.sellerOrgId,
        holdMicros,
        costMicros: cost,
        feeMicros: fee,
        sellerMicros: seller,
        baselineMicros: baseline,
        inputTokens,
        outputTokens,
        usageEstimated,
        latencyMs: totalLatency,
        ttftMs,
        retryCount,
      });
      void evaluateBudgetAlerts(ctx.orgId, projectId).catch((err) => logger.error({ err }, 'budget alert evaluation failed'));

      const meta: NexovraMeta = {
        request_id: id,
        model: c.modelId,
        offer_id: c.offerId,
        seller: c.sellerName,
        demo: c.isDemo,
        routing_mode: constraints.mode,
        routing_reason: decision.explanation,
        retries: retryCount,
        cost_usd: microsToUsd(cost),
        baseline_cost_usd: nullableMicrosToUsd(baseline),
        estimated_savings_usd: baseline !== null ? microsToUsd(baseline - cost) : null,
        usage_estimated: usageEstimated,
        latency_ms: totalLatency,
      };
      const usageOut = { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens };

      if (sink) {
        sink.send({ id: `chatcmpl-${id}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: c.modelId, choices: [], usage: usageOut, nexovra: meta });
        sink.send('[DONE]');
        sink.end();
        return null;
      }
      return {
        requestId: id,
        content,
        usage: usageOut,
        meta,
        body: {
          id: `chatcmpl-${id}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: c.modelId,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: content || (toolCalls ? null : ''), ...(toolCalls ? { tool_calls: toolCalls } : {}) },
              finish_reason: finishReason,
            },
          ],
          usage: usageOut,
          nexovra: meta,
        },
      };
    } catch (err) {
      clearTimeout(timer);
      const adapterErr =
        err instanceof AdapterError
          ? err
          : controller.signal.aborted
            ? new AdapterError('timeout', `Upstream did not respond within ${timeoutMs} ms`)
            : new AdapterError('network', sanitizeUpstreamError(err instanceof Error ? err.message : String(err)));
      const clientGone = clientAbort.signal.aborted;
      lastError = adapterErr;
      const latencyMs = Date.now() - attemptStart;
      if (!clientGone) {
        await prisma.requestAttempt.create({
          data: { requestId: id, offerId: c.offerId, attempt: i + 1, ok: false, latencyMs, statusCode: adapterErr.status, errorCode: adapterErr.kind, error: adapterErr.message.slice(0, 300) },
        });
        failureLog.push({ offer_id: c.offerId, seller: c.sellerName, error: `${adapterErr.kind}: ${adapterErr.message}`.slice(0, 200) });
        if (adapterErr.retryable) await markOfferFailure(c.offerId, adapterErr);
      }

      // Once bytes were streamed to the client a retry would duplicate output; bill delivered tokens instead.
      if (streamStarted && sink) {
        const outputTokens = estimateTextTokens(content);
        const cost = minBig(tokenCostMicros(estIn, outputTokens, c.inputPrice, c.outputPrice), holdMicros);
        const { fee, seller } = feeSplit(cost, env.PLATFORM_FEE_BPS);
        await settleSuccess({
          requestId: id,
          orgId: ctx.orgId,
          apiKeyId: ctx.apiKey?.id ?? null,
          modelId: c.modelId,
          offerId: c.offerId,
          sellerOrgId: c.sellerOrgId,
          holdMicros,
          costMicros: cost,
          feeMicros: fee,
          sellerMicros: seller,
          baselineMicros: null,
          inputTokens: estIn,
          outputTokens,
          usageEstimated: true,
          latencyMs: Date.now() - startedAt,
          ttftMs,
          retryCount,
          errorCode: clientGone ? 'client_disconnected' : 'stream_interrupted',
          errorMessage: clientGone ? 'Client disconnected; delivered tokens were billed.' : `Stream interrupted: ${adapterErr.message}`.slice(0, 300),
        });
        if (!sink.isClosed()) {
          sink.send({ error: { message: 'The upstream stream was interrupted. Partial output was delivered and billed.', type: 'api_error', code: 'stream_interrupted', request_id: id } });
          sink.send('[DONE]');
          sink.end();
        }
        return null;
      }
      if (clientGone) break;
      if (!adapterErr.retryable) break;
    } finally {
      clientAbort.signal.removeEventListener('abort', onClientAbort);
      await store.decr(inflightKey(c.offerId));
    }
  }

  // All attempts failed: release the hold, nothing is billed.
  const nonRetryable = lastError && !lastError.retryable;
  const status = nonRetryable ? 400 : 502;
  const code = clientAbort.signal.aborted ? 'client_disconnected' : nonRetryable ? 'upstream_rejected_request' : 'upstream_unavailable';
  const message = clientAbort.signal.aborted
    ? 'Client disconnected before a response was produced.'
    : nonRetryable
      ? `The provider rejected the request: ${lastError!.message}`
      : `All ${attempts.length} eligible offer(s) failed. The request was not billed.`;
  await settleFailure({
    requestId: id,
    orgId: ctx.orgId,
    apiKeyId: ctx.apiKey?.id ?? null,
    modelId: attempts[0]!.ranked.candidate.modelId,
    holdMicros,
    status: 'FAILED',
    httpStatus: status,
    errorCode: code,
    errorMessage: message.slice(0, 500),
    latencyMs: Date.now() - startedAt,
    retryCount,
  });
  if (!nonRetryable && !clientAbort.signal.aborted) {
    void emitEvent({
      orgId: ctx.orgId,
      type: 'provider.down',
      severity: 'warning',
      title: `Requests for ${body.model} are failing`,
      body: `All eligible offers failed for request ${id}. Nothing was billed.`,
      data: { request_id: id, model: body.model, failures: failureLog },
    });
  }
  throw new InferenceError(status, code, message, { attempts: failureLog }, id);
}

function summarizeConstraints(k: ReturnType<typeof mergeConstraints>) {
  return {
    required_capabilities: k.requiredCapabilities,
    input_modalities: k.requiredInputModalities,
    max_input_price_usd_per_m: k.maxInputPrice != null ? k.maxInputPrice / 1e6 : null,
    max_output_price_usd_per_m: k.maxOutputPrice != null ? k.maxOutputPrice / 1e6 : null,
    min_discount_pct: k.minDiscountPct,
    max_latency_ms: k.maxLatencyMs,
    min_reliability: k.minReliability,
    min_quality_score: k.minQualityScore,
    allowed_providers: k.allowedProviders,
    blocked_providers: k.blockedProviders,
    preferred_providers: k.preferredSellers,
    allow_demo_offers: k.allowDemoOffers,
  };
}

/** Dry-run routing for the UI and `/api/routing/simulate`: no request is sent or billed. */
export async function simulateRouting(orgId: string, input: { model: string; stream?: boolean; maxTokens?: number; promptTokens?: number; policyId?: string; overrides?: z.infer<typeof nexovraOptions> }) {
  const policy = await resolvePolicy(orgId, null, input.policyId);
  const resolved = await resolveModels(input.model);
  const caps = new Set(['chat', ...(input.overrides?.required_capabilities ?? [])]);
  if (input.stream) caps.add('streaming');
  const constraints = mergeConstraints(policy, input.overrides ?? {}, {
    requiredCapabilities: [...caps],
    requiredInputModalities: caps.has('vision') ? ['text', 'image'] : ['text'],
    estInputTokens: input.promptTokens ?? 500,
    estOutputTokens: input.maxTokens ?? 500,
  });
  const decision = rankCandidates(await loadCandidates(resolved.models.map((m) => m.id)), constraints);
  return { policy: { id: policy.id, name: policy.name, mode: constraints.mode }, trace: traceFor(decision, { constraints: summarizeConstraints(constraints) }) };
}
