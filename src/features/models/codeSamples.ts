import type { CodeSample } from '@/components/ui';

const PROMPT = 'Give me three ideas for naming a developer tool.';

/** OpenAI-SDK snippets for calling a model through the Nexovra API. */
export function modelCodeSamples(modelId: string, baseUrl: string): CodeSample[] {
  const model = JSON.stringify(modelId);
  const base = JSON.stringify(baseUrl);
  return [
    {
      label: 'Python',
      language: 'python',
      code: `import os
from openai import OpenAI

client = OpenAI(
    base_url=${base},
    api_key=os.environ["NEXOVRA_API_KEY"],
)

response = client.chat.completions.create(
    model=${model},
    messages=[{"role": "user", "content": ${JSON.stringify(PROMPT)}}],
)

print(response.choices[0].message.content)`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: ${base},
  apiKey: process.env.NEXOVRA_API_KEY,
});

const completion = await client.chat.completions.create({
  model: ${model},
  messages: [{ role: "user", content: ${JSON.stringify(PROMPT)} }],
});

console.log(completion.choices[0]?.message.content);`,
    },
    {
      label: 'cURL',
      language: 'bash',
      code: `curl ${baseUrl.replace(/\/$/, '')}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ model: modelId, messages: [{ role: 'user', content: PROMPT }] }).replace(/'/g, "'\\''")}'`,
    },
  ];
}
