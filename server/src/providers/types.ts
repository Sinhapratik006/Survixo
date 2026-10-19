export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer';
  content: string | ContentPart[] | null;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

/** Normalized request sent to an adapter. `model` is the upstream model name. */
export interface UpstreamChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  seed?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: { type: string; [k: string]: unknown };
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatResult {
  content: string | null;
  toolCalls?: unknown[];
  finishReason: string;
  usage?: UsageInfo;
}

export interface StreamChunk {
  content?: string;
  toolCalls?: unknown[];
  finishReason?: string;
  usage?: UsageInfo;
}

export interface AdapterContext {
  baseUrl: string;
  apiKey?: string;
  config?: Record<string, unknown> | null;
  signal: AbortSignal;
}

export interface AdapterFeatures {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  jsonMode: boolean;
}

export type AdapterErrorKind =
  | 'timeout'
  | 'network'
  | 'server'
  | 'rate_limited'
  | 'auth'
  | 'bad_request'
  | 'bad_response'
  | 'blocked';

const RETRYABLE: AdapterErrorKind[] = ['timeout', 'network', 'server', 'rate_limited', 'auth', 'bad_response', 'blocked'];

export class AdapterError extends Error {
  readonly retryable: boolean;
  constructor(
    public kind: AdapterErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    // A 4xx caused by the buyer's request (bad_request) would fail on every seller, so it is not retried.
    this.retryable = RETRYABLE.includes(kind);
  }
}

export interface ProviderAdapter {
  readonly id: string;
  readonly label: string;
  readonly features: AdapterFeatures;
  /** Authentication scheme used against the upstream endpoint. */
  readonly auth: 'bearer' | 'none';
  listModels(ctx: AdapterContext): Promise<string[]>;
  chat(req: UpstreamChatRequest, ctx: AdapterContext): Promise<ChatResult>;
  chatStream(req: UpstreamChatRequest, ctx: AdapterContext): AsyncGenerator<StreamChunk>;
}
