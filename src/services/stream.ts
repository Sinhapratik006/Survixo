import { apiHeaders, parseError } from '@/lib/api';

export interface StreamMeta {
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

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone?: (info: { usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; meta?: StreamMeta }) => void;
  onError?: (message: string, code?: string, requestId?: string) => void;
}

/**
 * Stream a playground chat completion (OpenAI-compatible SSE) through the
 * session-authenticated `/api/playground/chat` endpoint.
 */
export async function streamPlaygroundChat(body: Record<string, unknown>, handlers: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api/playground/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: apiHeaders(true),
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok) throw await parseError(res);
  if (!res.body) throw new Error('No response stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const json = JSON.parse(data) as {
          error?: { message: string; code?: string; request_id?: string };
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
          nexovra?: StreamMeta;
        };
        if (json.error) handlers.onError?.(json.error.message, json.error.code, json.error.request_id);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) handlers.onDelta(delta);
        if (json.usage || json.nexovra) handlers.onDone?.({ usage: json.usage, meta: json.nexovra });
      }
    }
  }
}
