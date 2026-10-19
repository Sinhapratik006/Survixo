import { useConfig } from '@/hooks/useConfig';
import type { CodeSample } from '@/components/ui';

/** Public OpenAI-compatible base URL (config.apiBaseUrl, falling back to this origin + /v1). */
export function useApiBaseUrl(): string {
  const { data } = useConfig();
  if (data?.apiBaseUrl) return data.apiBaseUrl.replace(/\/$/, '');
  return typeof window !== 'undefined' ? `${window.location.origin}/v1` : '/v1';
}

export const EXAMPLE_MODEL = 'llama-3.1-8b-instruct';

export function quickstartSamples(baseUrl: string): CodeSample[] {
  return [
    {
      label: 'Python',
      language: 'python',
      code: `import os
from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.environ["NEXOVRA_API_KEY"],
)

response = client.chat.completions.create(
    model="${EXAMPLE_MODEL}",
    messages=[{"role": "user", "content": "Summarize this support ticket in one sentence."}],
    max_tokens=200,
    # Optional Nexovra extension: routing preferences for this request only
    extra_body={"nexovra": {"routing_mode": "lowest_cost", "max_cost_usd": 0.01}},
)

print(response.choices[0].message.content)
print(response.model_extra.get("nexovra"))  # selected offer, cost and routing reason`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${baseUrl}',
  apiKey: process.env.NEXOVRA_API_KEY,
});

const params = {
  model: '${EXAMPLE_MODEL}',
  messages: [{ role: 'user', content: 'Summarize this support ticket in one sentence.' }],
  max_tokens: 200,
  // Optional Nexovra extension: routing preferences for this request only
  nexovra: { routing_mode: 'lowest_cost', max_cost_usd: 0.01 },
} as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;

const completion = await client.chat.completions.create(params);

console.log(completion.choices[0]?.message.content);
console.log((completion as unknown as { nexovra?: unknown }).nexovra);`,
    },
    {
      label: 'cURL',
      language: 'bash',
      code: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${EXAMPLE_MODEL}",
    "messages": [{"role": "user", "content": "Summarize this support ticket in one sentence."}],
    "max_tokens": 200,
    "nexovra": {"routing_mode": "lowest_cost", "max_cost_usd": 0.01}
  }'`,
    },
  ];
}
