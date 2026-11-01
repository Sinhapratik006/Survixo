import { z } from 'zod';
import { readCapped, safeFetch, SsrfError } from '../security/ssrf.js';
import { sanitizeUpstreamError } from '../security/redact.js';
import {
  AdapterError,
  type AdapterContext,
  type ChatResult,
  type ProviderAdapter,
  type StreamChunk,
  type UpstreamChatRequest,
} from './types.js';

const usageSchema = z
  .object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() })
  .passthrough();

const completionSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string().nullable().optional(),
                tool_calls: z.array(z.unknown()).optional(),
              })
              .passthrough(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .min(1),
    usage: usageSchema.optional().nullable(),
  })
  .passthrough();

const chunkSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            delta: z
              .object({ content: z.string().nullable().optional(), tool_calls: z.array(z.unknown()).optional() })
              .passthrough()
              .optional(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
    usage: usageSchema.optional().nullable(),
  })
  .passthrough();

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough();

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_STREAM_BYTES = 16 * 1024 * 1024;

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function headers(ctx: AdapterContext, json = true): Record<string, string> {
  const h: Record<string, string> = { accept: json ? 'application/json' : 'text/event-stream', 'user-agent': 'nexovra-router/0.1' };
  if (json) h['content-type'] = 'application/json';
  if (ctx.apiKey) h.authorization = `Bearer ${ctx.apiKey}`;
  return h;
}

function classifyStatus(status: number): AdapterError['kind'] {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 402 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'bad_request';
}

function toAdapterError(err: unknown, signal: AbortSignal): AdapterError {
  if (err instanceof AdapterError) return err;
  if (err instanceof SsrfError) return new AdapterError('blocked', err.message);
  if (signal.aborted) return new AdapterError('timeout', 'Upstream request timed out');
  const message = err instanceof Error ? err.message : String(err);
  return new AdapterError('network', sanitizeUpstreamError(message));
}

async function errorFromResponse(res: Awaited<ReturnType<typeof safeFetch>>): Promise<AdapterError> {
  let detail = '';
  try {
    const text = await readCapped(res, 16 * 1024);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      detail = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? text);
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  return new AdapterError(classifyStatus(res.status), `Upstream returned ${res.status}: ${sanitizeUpstreamError(detail || res.statusText)}`, res.status);
}

/** Adapter for upstreams implementing the OpenAI Chat Completions HTTP API. */
export const openaiCompatibleAdapter: ProviderAdapter = {
  id: 'openai_compatible',
  label: 'OpenAI-compatible HTTP endpoint',
  auth: 'bearer',
  // Protocol-level support; the upstream may still reject a feature, which is surfaced as bad_request.
  features: { streaming: true, tools: true, vision: true, jsonMode: true },

  async listModels(ctx) {
    try {
      const res = await safeFetch(joinUrl(ctx.baseUrl, 'models'), { method: 'GET', headers: headers(ctx), signal: ctx.signal });
      if (!res.ok) throw await errorFromResponse(res);
      const parsed = modelsSchema.safeParse(JSON.parse(await readCapped(res, MAX_JSON_BYTES)));
      if (!parsed.success) throw new AdapterError('bad_response', 'Upstream /models response did not match the expected schema');
      return parsed.data.data.map((m) => m.id).slice(0, 2000);
    } catch (err) {
      throw toAdapterError(err, ctx.signal);
    }
  },

  async chat(req, ctx): Promise<ChatResult> {
    try {
      const res = await safeFetch(joinUrl(ctx.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: headers(ctx),
        body: JSON.stringify({ ...req, stream: false }),
        signal: ctx.signal,
      });
      if (!res.ok) throw await errorFromResponse(res);
      let body: unknown;
      try {
        body = JSON.parse(await readCapped(res, MAX_JSON_BYTES));
      } catch {
        throw new AdapterError('bad_response', 'Upstream returned invalid JSON');
      }
      const parsed = completionSchema.safeParse(body);
      if (!parsed.success) throw new AdapterError('bad_response', 'Upstream response did not match the chat completion schema');
      const choice = parsed.data.choices[0]!;
      return {
        content: choice.message.content ?? null,
        toolCalls: choice.message.tool_calls,
        finishReason: choice.finish_reason ?? 'stop',
        usage: parsed.data.usage ?? undefined,
      };
    } catch (err) {
      throw toAdapterError(err, ctx.signal);
    }
  },

  async *chatStream(req: UpstreamChatRequest, ctx: AdapterContext): AsyncGenerator<StreamChunk> {
    let res;
    try {
      res = await safeFetch(joinUrl(ctx.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: headers(ctx, false),
        body: JSON.stringify({ ...req, stream: true, stream_options: { include_usage: true } }),
        signal: ctx.signal,
      });
      if (!res.ok) throw await errorFromResponse(res);
      if (!res.body) throw new AdapterError('bad_response', 'Upstream returned an empty stream');
    } catch (err) {
      throw toAdapterError(err, ctx.signal);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_STREAM_BYTES) throw new AdapterError('bad_response', 'Upstream stream exceeded size limit');
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const event = buffer.slice(0, sep);
          buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '');
          for (const line of event.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            if (data === '[DONE]') return;
            let json: unknown;
            try {
              json = JSON.parse(data);
            } catch {
              throw new AdapterError('bad_response', 'Upstream stream contained invalid JSON');
            }
            const parsed = chunkSchema.safeParse(json);
            if (!parsed.success) throw new AdapterError('bad_response', 'Upstream stream chunk did not match the expected schema');
            const choice = parsed.data.choices?.[0];
            const chunk: StreamChunk = {};
            if (choice?.delta?.content) chunk.content = choice.delta.content;
            if (choice?.delta?.tool_calls) chunk.toolCalls = choice.delta.tool_calls;
            if (choice?.finish_reason) chunk.finishReason = choice.finish_reason;
            if (parsed.data.usage) chunk.usage = parsed.data.usage;
            if (Object.keys(chunk).length) yield chunk;
          }
        }
      }
    } catch (err) {
      throw toAdapterError(err, ctx.signal);
    } finally {
      reader.cancel().catch(() => undefined);
    }
  },
};
