import { createHash } from 'node:crypto';
import { estimatePromptTokens, estimateTextTokens, messageText } from '../routing/tokens.js';
import {
  AdapterError,
  type AdapterContext,
  type ChatResult,
  type ProviderAdapter,
  type StreamChunk,
  type UpstreamChatRequest,
} from './types.js';

/**
 * DEMO ADAPTER - generates synthetic responses locally. No AI model is called.
 * It exists so the full marketplace flow (routing, failover, billing, traces,
 * health checks, benchmarks) can be exercised without provider credentials.
 * Only available when DEMO_MODE=true. Every response is prefixed with a
 * visible notice so it can never be mistaken for real model output.
 *
 * Endpoint config (JSON):
 *   latencyMs: [min, max]   simulated latency range
 *   failureRate: 0..1       probability of a simulated upstream 503
 *   arithmeticAccuracy: 0..1 probability of answering "What is A + B?" correctly
 */
interface DemoConfig {
  latencyMs: [number, number];
  failureRate: number;
  arithmeticAccuracy: number;
}

export const DEMO_NOTICE = '[Demo response - synthetic text, no AI model was called]';

function readConfig(ctx: AdapterContext): DemoConfig {
  const c = (ctx.config ?? {}) as Partial<DemoConfig>;
  const range = Array.isArray(c.latencyMs) && c.latencyMs.length === 2 ? c.latencyMs : [120, 450];
  return {
    latencyMs: [Math.max(0, Number(range[0])), Math.max(0, Number(range[1]))],
    failureRate: Math.min(1, Math.max(0, Number(c.failureRate ?? 0))),
    arithmeticAccuracy: Math.min(1, Math.max(0, Number(c.arithmeticAccuracy ?? 0.9))),
  };
}

function unitHash(input: string): number {
  return createHash('sha256').update(input).digest().readUInt32BE(0) / 0xffffffff;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new AdapterError('timeout', 'Upstream request timed out'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new AdapterError('timeout', 'Upstream request timed out'));
      },
      { once: true },
    );
  });
}

function compose(req: UpstreamChatRequest, cfg: DemoConfig): string {
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
  const question = lastUser ? messageText(lastUser).trim() : '';

  const arithmetic = question.match(/what is\s+(-?\d+)\s*([+\-*x×])\s*(-?\d+)\s*\??/i);
  if (arithmetic) {
    const a = Number(arithmetic[1]);
    const b = Number(arithmetic[3]);
    const op = arithmetic[2]!;
    const exact = op === '+' ? a + b : op === '-' ? a - b : a * b;
    // Deterministic per (model, question) so benchmark runs are reproducible.
    const correct = unitHash(`${req.model}|${question}`) < cfg.arithmeticAccuracy;
    const answer = correct ? exact : exact + (unitHash(question) > 0.5 ? 1 : -1);
    return `${DEMO_NOTICE} The answer is ${answer}.`;
  }

  if (req.response_format?.type === 'json_object' || req.response_format?.type === 'json_schema') {
    return JSON.stringify({ demo: true, notice: DEMO_NOTICE, echo: question.slice(0, 120) });
  }

  const snippet = question.length > 160 ? `${question.slice(0, 160)}…` : question;
  return [
    DEMO_NOTICE,
    `Served by demo upstream "${req.model}".`,
    snippet ? `You asked: "${snippet}"` : 'No user message was provided.',
    'Connect a real OpenAI-compatible seller endpoint to receive live model output. Routing, latency, token accounting and billing for this request were processed exactly as they would be for a live offer.',
  ].join(' ');
}

function truncateToTokens(text: string, maxTokens: number): { text: string; truncated: boolean } {
  const maxChars = Math.max(1, maxTokens) * 4;
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

async function simulate(req: UpstreamChatRequest, ctx: AdapterContext) {
  const cfg = readConfig(ctx);
  const [min, max] = cfg.latencyMs;
  await sleep(min + Math.random() * Math.max(0, max - min), ctx.signal);
  if (Math.random() < cfg.failureRate) throw new AdapterError('server', 'Upstream returned 503: simulated demo outage', 503);
  if (req.tools?.length) throw new AdapterError('bad_request', 'Demo endpoints do not support tool calling', 400);
  if (req.messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')))
    throw new AdapterError('bad_request', 'Demo endpoints do not accept image inputs', 400);
  const { text, truncated } = truncateToTokens(compose(req, cfg), req.max_tokens);
  return {
    text,
    finishReason: truncated ? 'length' : 'stop',
    usage: { prompt_tokens: estimatePromptTokens(req.messages), completion_tokens: estimateTextTokens(text) },
  };
}

export const demoAdapter: ProviderAdapter = {
  id: 'demo',
  label: 'Demo endpoint (synthetic responses)',
  auth: 'none',
  features: { streaming: true, tools: false, vision: false, jsonMode: true },

  async listModels(ctx) {
    const models = (ctx.config as { models?: unknown } | null)?.models;
    return Array.isArray(models) ? models.map(String) : [];
  },

  async chat(req, ctx): Promise<ChatResult> {
    const out = await simulate(req, ctx);
    return { content: out.text, finishReason: out.finishReason, usage: out.usage };
  },

  async *chatStream(req, ctx): AsyncGenerator<StreamChunk> {
    const out = await simulate(req, ctx);
    const pieces = out.text.match(/\S+\s*/g) ?? [out.text];
    for (const piece of pieces) {
      await sleep(12, ctx.signal);
      yield { content: piece };
    }
    yield { finishReason: out.finishReason, usage: out.usage };
  },
};
