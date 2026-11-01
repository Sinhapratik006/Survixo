import type { ChatMessage } from '../providers/types.js';

/**
 * Heuristic token estimate (~4 characters per token for English text).
 * Used only for pre-request cost estimates and budget holds, and as a fallback
 * when an upstream does not report usage (such requests are flagged
 * `usageEstimated`). Real tokenizers differ per model.
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export const IMAGE_TOKEN_ESTIMATE = 1000;

export function messageText(message: ChatMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (!message.content) return '';
  return message.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
}

export function estimatePromptTokens(messages: ChatMessage[]): number {
  let total = 3;
  for (const m of messages) {
    total += 4 + estimateTextTokens(messageText(m));
    if (Array.isArray(m.content)) total += m.content.filter((p) => p.type === 'image_url').length * IMAGE_TOKEN_ESTIMATE;
    if (m.tool_calls) total += estimateTextTokens(JSON.stringify(m.tool_calls));
  }
  return total;
}
