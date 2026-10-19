import type { CodeSample } from '@/components/ui';
import { EXAMPLE_MODEL as M } from './docsKit';

const PROMPT = 'Explain what an inference marketplace does in one sentence.';

/** Python / TypeScript client construction shared by every example. */
const pyClient = (base: string) => `import os
from openai import OpenAI

client = OpenAI(
    base_url="${base}",
    api_key=os.environ["NEXOVRA_API_KEY"],
)`;

const tsClient = (base: string) => `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${base}',
  apiKey: process.env.NEXOVRA_API_KEY,
});`;

const tsMetaType = `// Fields of the \`nexovra\` object returned with every successful completion.
interface NexovraMeta {
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
}`;

export function basicChat(base: string): CodeSample[] {
  return [
    {
      label: 'Python',
      language: 'python',
      code: `${pyClient(base)}

completion = client.chat.completions.create(
    model="${M}",
    messages=[{"role": "user", "content": "${PROMPT}"}],
    max_tokens=200,
)

print(completion.choices[0].message.content)

# Nexovra adds a \`nexovra\` object with routing and billing details.
meta = completion.model_dump().get("nexovra") or {}
print(meta.get("request_id"), meta.get("seller"), meta.get("cost_usd"))`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `${tsClient(base)}

${tsMetaType}

const completion = await client.chat.completions.create({
  model: '${M}',
  messages: [{ role: 'user', content: '${PROMPT}' }],
  max_tokens: 200,
});

console.log(completion.choices[0]?.message.content);

const meta = (completion as unknown as { nexovra?: NexovraMeta }).nexovra;
console.log(meta?.request_id, meta?.seller, meta?.cost_usd);`,
    },
    {
      label: 'cURL',
      language: 'bash',
      code: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${M}",
    "messages": [{"role": "user", "content": "${PROMPT}"}],
    "max_tokens": 200
  }'`,
    },
  ];
}

export function streamingChat(base: string): CodeSample[] {
  return [
    {
      label: 'Python',
      language: 'python',
      code: `${pyClient(base)}

stream = client.chat.completions.create(
    model="${M}",
    messages=[{"role": "user", "content": "${PROMPT}"}],
    max_tokens=200,
    stream=True,
)

for chunk in stream:
    if chunk.choices:
        print(chunk.choices[0].delta.content or "", end="", flush=True)
    else:
        # The last chunk has no choices; it carries \`usage\` and the \`nexovra\` summary.
        data = chunk.model_dump()
        meta = data.get("nexovra") or {}
        print("\\nusage:", data.get("usage"))
        print("request_id:", meta.get("request_id"), "cost_usd:", meta.get("cost_usd"))`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `${tsClient(base)}

const stream = await client.chat.completions.create({
  model: '${M}',
  messages: [{ role: 'user', content: '${PROMPT}' }],
  max_tokens: 200,
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) process.stdout.write(delta);

  // The last chunk has empty \`choices\`, plus \`usage\` and the \`nexovra\` summary.
  const meta = (chunk as unknown as { nexovra?: { request_id: string; cost_usd: number } }).nexovra;
  if (meta) console.log('\\nrequest_id:', meta.request_id, 'cost_usd:', meta.cost_usd);
}`,
    },
    {
      label: 'cURL',
      language: 'bash',
      code: `curl -N ${base}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${M}",
    "messages": [{"role": "user", "content": "${PROMPT}"}],
    "max_tokens": 200,
    "stream": true
  }'`,
    },
  ];
}

export function routingOptions(base: string): CodeSample[] {
  return [
    {
      label: 'Python',
      language: 'python',
      code: `${pyClient(base)}

completion = client.chat.completions.create(
    model="${M}",
    messages=[{"role": "user", "content": "Draft a two-line status update."}],
    max_tokens=300,
    # Nexovra-specific options travel in the request body under "nexovra".
    extra_body={
        "nexovra": {
            "routing_mode": "balanced",
            "max_latency_ms": 2000,
            "min_reliability": 90,
            "blocked_providers": ["example-seller-slug"],
        }
    },
)

print(completion.model_dump()["nexovra"]["routing_reason"])`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `${tsClient(base)}

// The OpenAI SDK types do not know the \`nexovra\` field; extra body fields are sent as-is.
const params = {
  model: '${M}',
  messages: [{ role: 'user' as const, content: 'Draft a two-line status update.' }],
  max_tokens: 300,
  nexovra: {
    routing_mode: 'balanced',
    max_latency_ms: 2000,
    min_reliability: 90,
    blocked_providers: ['example-seller-slug'],
  },
};

const completion = await client.chat.completions.create(
  params as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
);
console.log((completion as unknown as { nexovra: { routing_reason: string } }).nexovra.routing_reason);`,
    },
    {
      label: 'cURL',
      language: 'bash',
      code: `# Routing can also be selected with headers: X-Nexovra-Routing and X-Min-Discount.
curl ${base}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-Nexovra-Routing: lowest-cost" \\
  -H "X-Min-Discount: 10" \\
  -d '{
    "model": "${M}",
    "messages": [{"role": "user", "content": "Draft a two-line status update."}],
    "max_tokens": 300,
    "nexovra": { "max_latency_ms": 2000, "blocked_providers": ["example-seller-slug"] }
  }'`,
    },
  ];
}

export function agentMode(base: string): CodeSample[] {
  return [
    {
      label: 'Python',
      language: 'python',
      code: `${pyClient(base)}

completion = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Extract the city and date from: 'See you in Lisbon on 3 May.' Reply as JSON."}],
    max_tokens=256,
    response_format={"type": "json_object"},  # adds the json_mode requirement automatically
    extra_body={
        "nexovra": {
            "routing_mode": "quality_first",
            "max_cost_usd": 0.002,
            "min_quality_score": 0.7,
            "max_latency_ms": 3000,
            "allowed_providers": ["meta", "alibaba"],
            "task_id": "invoice-batch-42",
        }
    },
)

meta = completion.model_dump()["nexovra"]
print(meta["model"], meta["cost_usd"], completion.choices[0].finish_reason)`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `${tsClient(base)}

const params = {
  model: 'auto',
  messages: [{ role: 'user' as const, content: "Extract the city and date from: 'See you in Lisbon on 3 May.' Reply as JSON." }],
  max_tokens: 256,
  response_format: { type: 'json_object' as const }, // adds the json_mode requirement automatically
  nexovra: {
    routing_mode: 'quality_first',
    max_cost_usd: 0.002,
    min_quality_score: 0.7,
    max_latency_ms: 3000,
    allowed_providers: ['meta', 'alibaba'],
    task_id: 'invoice-batch-42',
  },
};

const completion = await client.chat.completions.create(
  params as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
);

const meta = (completion as unknown as { nexovra: { model: string; cost_usd: number } }).nexovra;
console.log(meta.model, meta.cost_usd, completion.choices[0]?.finish_reason);`,
    },
    {
      label: 'cURL',
      language: 'bash',
      code: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-Nexovra-Task-Id: invoice-batch-42" \\
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Extract the city and date from: See you in Lisbon on 3 May. Reply as JSON."}],
    "max_tokens": 256,
    "response_format": {"type": "json_object"},
    "nexovra": {
      "routing_mode": "quality_first",
      "max_cost_usd": 0.002,
      "min_quality_score": 0.7,
      "max_latency_ms": 3000,
      "allowed_providers": ["meta", "alibaba"]
    }
  }'`,
    },
  ];
}

export function idempotency(base: string): CodeSample[] {
  return [
    {
      label: 'Python',
      language: 'python',
      code: `import os, uuid
import openai
from openai import OpenAI

# SDK auto-retries would resend the same Idempotency-Key, so handle retries yourself.
client = OpenAI(base_url="${base}", api_key=os.environ["NEXOVRA_API_KEY"], max_retries=0)

key = str(uuid.uuid4())  # store it with the job so a retry reuses the same key
try:
    completion = client.chat.completions.create(
        model="${M}",
        messages=[{"role": "user", "content": "Write a haiku about routing."}],
        max_tokens=100,
        extra_headers={"Idempotency-Key": key},
    )
except openai.ConflictError as err:  # HTTP 409, code "idempotency_conflict"
    details = err.body.get("details", {}) if isinstance(err.body, dict) else {}
    print("Already processed:", details.get("original_request_id"), details.get("original_status"))`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';

// SDK auto-retries would resend the same Idempotency-Key, so handle retries yourself.
const client = new OpenAI({ baseURL: '${base}', apiKey: process.env.NEXOVRA_API_KEY, maxRetries: 0 });

const key = randomUUID(); // persist it with the job so a retry reuses the same key
try {
  const completion = await client.chat.completions.create(
    { model: '${M}', messages: [{ role: 'user', content: 'Write a haiku about routing.' }], max_tokens: 100 },
    { headers: { 'Idempotency-Key': key } },
  );
  console.log(completion.choices[0]?.message.content);
} catch (err) {
  if (err instanceof OpenAI.APIError && err.status === 409) {
    const details = (err.error as { details?: { original_request_id?: string; original_status?: string } } | undefined)?.details;
    console.log('Already processed:', details?.original_request_id, details?.original_status);
  } else {
    throw err;
  }
}`,
    },
    {
      label: 'cURL',
      language: 'bash',
      code: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 6f1c2d4e-7a8b-4c9d-8e0f-123456789abc" \\
  -d '{"model": "${M}", "messages": [{"role": "user", "content": "Write a haiku about routing."}], "max_tokens": 100}'`,
    },
  ];
}

export function rawHeaders(base: string): CodeSample[] {
  return [
    {
      label: 'Python',
      language: 'python',
      code: `${pyClient(base)}

raw = client.chat.completions.with_raw_response.create(
    model="${M}",
    messages=[{"role": "user", "content": "Say hello."}],
    max_tokens=20,
)
print("request id:", raw.headers.get("x-nexovra-request-id"))
print("cost (USD):", raw.headers.get("x-nexovra-cost-usd"))

completion = raw.parse()
meta = completion.model_dump()["nexovra"]
print(meta["seller"], meta["routing_mode"], meta["retries"], meta["usage_estimated"])`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `${tsClient(base)}

const { data, response } = await client.chat.completions
  .create({ model: '${M}', messages: [{ role: 'user', content: 'Say hello.' }], max_tokens: 20 })
  .withResponse();

console.log('request id:', response.headers.get('x-nexovra-request-id'));
console.log('cost (USD):', response.headers.get('x-nexovra-cost-usd'));

const meta = (data as unknown as { nexovra: { seller: string; routing_mode: string; retries: number } }).nexovra;
console.log(meta.seller, meta.routing_mode, meta.retries);`,
    },
    {
      label: 'cURL',
      language: 'bash',
      code: `# -i prints response headers (x-nexovra-request-id, x-nexovra-cost-usd, RateLimit-*)
curl -i ${base}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${M}", "messages": [{"role": "user", "content": "Say hello."}], "max_tokens": 20}'`,
    },
  ];
}

export function errorHandling(base: string): CodeSample[] {
  return [
    {
      label: 'Python',
      language: 'python',
      code: `import os
import openai
from openai import OpenAI

client = OpenAI(base_url="${base}", api_key=os.environ["NEXOVRA_API_KEY"])

try:
    completion = client.chat.completions.create(
        model="${M}",
        messages=[{"role": "user", "content": "Hi"}],
        max_tokens=50,
    )
except openai.APIStatusError as err:
    # err.code is the Nexovra error code, err.body is the "error" object.
    print(err.status_code, err.code, err.message)
    details = err.body.get("details") if isinstance(err.body, dict) else None
    if details:
        print("request_id:", details.get("request_id"))`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `${tsClient(base)}

try {
  await client.chat.completions.create({ model: '${M}', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 50 });
} catch (err) {
  if (err instanceof OpenAI.APIError) {
    // err.code is the Nexovra error code; err.error is the "error" object.
    console.log(err.status, err.code, err.message);
    const details = (err.error as { details?: { request_id?: string } } | undefined)?.details;
    if (details?.request_id) console.log('request_id:', details.request_id);
  } else {
    throw err;
  }
}`,
    },
  ];
}

export function listModels(base: string): CodeSample[] {
  return [
    {
      label: 'cURL',
      language: 'bash',
      code: `curl ${base}/models -H "Authorization: Bearer $NEXOVRA_API_KEY"

# A single model (catalog id or alias)
curl ${base}/models/${M} -H "Authorization: Bearer $NEXOVRA_API_KEY"`,
    },
    {
      label: 'Python',
      language: 'python',
      code: `${pyClient(base)}

for model in client.models.list():
    info = model.model_dump().get("nexovra") or {}
    print(model.id, info.get("healthy_offers"), info.get("best_offer_usd_per_m"))`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `${tsClient(base)}

for await (const model of client.models.list()) {
  const info = (model as unknown as { nexovra?: { healthy_offers: number } }).nexovra;
  console.log(model.id, info?.healthy_offers);
}`,
    },
  ];
}

export function accountEndpoints(base: string): CodeSample[] {
  return [
    {
      label: 'cURL',
      language: 'bash',
      code: `# Balance, held funds and this key's spend
curl ${base}/balance -H "Authorization: Bearer $NEXOVRA_API_KEY"

# Daily usage for this key (days: 1-90, default 30)
curl "${base}/usage?days=7" -H "Authorization: Bearer $NEXOVRA_API_KEY"

# Request record, routing trace and attempts (requests made with this key only)
curl ${base}/requests/req_XXXXXXXXXXXXXXXXXXXXXXXX -H "Authorization: Bearer $NEXOVRA_API_KEY"`,
    },
    {
      label: 'Python',
      language: 'python',
      code: `import os, requests

BASE = "${base}"
HEADERS = {"Authorization": f"Bearer {os.environ['NEXOVRA_API_KEY']}"}

print(requests.get(f"{BASE}/balance", headers=HEADERS, timeout=10).json())
print(requests.get(f"{BASE}/usage", params={"days": 7}, headers=HEADERS, timeout=10).json())
print(requests.get(f"{BASE}/requests/req_XXXXXXXXXXXXXXXXXXXXXXXX", headers=HEADERS, timeout=10).json())`,
    },
    {
      label: 'TypeScript',
      language: 'typescript',
      code: `const BASE = '${base}';
const headers = { Authorization: \`Bearer \${process.env.NEXOVRA_API_KEY}\` };

const balance = await fetch(\`\${BASE}/balance\`, { headers }).then((r) => r.json());
const usage = await fetch(\`\${BASE}/usage?days=7\`, { headers }).then((r) => r.json());
const trace = await fetch(\`\${BASE}/requests/req_XXXXXXXXXXXXXXXXXXXXXXXX\`, { headers }).then((r) => r.json());
console.log(balance, usage, trace);`,
    },
  ];
}

export const envVarSamples: CodeSample[] = [
  { label: 'macOS / Linux', language: 'bash', code: 'export NEXOVRA_API_KEY="nxv_your_key_here"' },
  { label: 'Windows PowerShell', language: 'powershell', code: '$env:NEXOVRA_API_KEY = "nxv_your_key_here"' },
  { label: '.env file', language: 'bash', code: '# Load on the server only; never commit this file or ship it to a browser bundle.\nNEXOVRA_API_KEY=nxv_your_key_here' },
];

// ───────────── Example payloads (shapes match the server code) ─────────────

export const exampleCompletion = `{
  "id": "chatcmpl-req_7Gk2pQ9sLx4VbN1mZr8TcW3e",
  "object": "chat.completion",
  "created": 1760969000,
  "model": "${M}",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "An inference marketplace matches requests for AI model output with sellers who run that model, at competing prices." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 21, "completion_tokens": 34, "total_tokens": 55 },
  "nexovra": {
    "request_id": "req_7Gk2pQ9sLx4VbN1mZr8TcW3e",
    "model": "${M}",
    "offer_id": "cm2x8k1f00003l8h1q9z7v6ab",
    "seller": "Example Seller",
    "demo": false,
    "routing_mode": "LOWEST_COST",
    "routing_reason": "Selected Example Seller for ${M} by lowest estimated cost among 3 eligible offer(s). Estimated cost $0.000033 (17.5% below the baseline estimate); median latency 412 ms. 1 offer(s) were ineligible.",
    "retries": 0,
    "cost_usd": 0.000008,
    "baseline_cost_usd": 0.00001,
    "estimated_savings_usd": 0.000002,
    "usage_estimated": false,
    "latency_ms": 640
  }
}`;

export const exampleStream = `data: {"id":"chatcmpl-req_7Gk2pQ9sLx4VbN1mZr8TcW3e","object":"chat.completion.chunk","created":1760969000,"model":"${M}","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-req_7Gk2pQ9sLx4VbN1mZr8TcW3e","object":"chat.completion.chunk","created":1760969000,"model":"${M}","choices":[{"index":0,"delta":{"content":"An "},"finish_reason":null}]}

data: {"id":"chatcmpl-req_7Gk2pQ9sLx4VbN1mZr8TcW3e","object":"chat.completion.chunk","created":1760969000,"model":"${M}","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-req_7Gk2pQ9sLx4VbN1mZr8TcW3e","object":"chat.completion.chunk","created":1760969001,"model":"${M}","choices":[],"usage":{"prompt_tokens":21,"completion_tokens":34,"total_tokens":55},"nexovra":{"request_id":"req_7Gk2pQ9sLx4VbN1mZr8TcW3e","model":"${M}","offer_id":"cm2x8k1f00003l8h1q9z7v6ab","seller":"Example Seller","demo":false,"routing_mode":"LOWEST_COST","routing_reason":"...","retries":0,"cost_usd":0.000008,"baseline_cost_usd":0.00001,"estimated_savings_usd":0.000002,"usage_estimated":false,"latency_ms":702}}

data: [DONE]`;

export const exampleStreamError = `data: {"error":{"message":"The upstream stream was interrupted. Partial output was delivered and billed.","type":"upstream_error","code":"stream_interrupted","request_id":"req_7Gk2pQ9sLx4VbN1mZr8TcW3e"}}

data: [DONE]`;

export const exampleModels = `{
  "object": "list",
  "data": [
    {
      "id": "${M}",
      "object": "model",
      "created": 0,
      "owned_by": "meta",
      "nexovra": {
        "name": "Llama 3.1 8B Instruct",
        "context_window": 131072,
        "max_output_tokens": 8192,
        "input_modalities": ["text"],
        "output_modalities": ["text"],
        "capabilities": [
          { "name": "chat", "status": "declared" },
          { "name": "json_mode", "status": "declared" },
          { "name": "streaming", "status": "declared" },
          { "name": "tools", "status": "declared" }
        ],
        "baseline_price_usd_per_m": { "input": 0.18, "output": 0.18, "demo": true },
        "best_offer_usd_per_m": { "input": 0.12, "output": 0.15, "demo": true },
        "healthy_offers": 3
      }
    }
  ]
}`;

export const exampleBalance = `{
  "balance_usd": 4.982113,
  "held_usd": 0.000037,
  "key": { "spent_usd": 0.01785, "spend_limit_usd": 25 }
}`;

export const exampleUsage = `{
  "object": "usage",
  "days": 7,
  "data": [
    { "day": "2026-10-19", "model": "${M}", "requests": 42, "failures": 1, "input_tokens": 18240, "output_tokens": 9310, "cost_usd": 0.003585 }
  ],
  "by_model": [
    { "model": "${M}", "requests": 42, "failures": 1, "input_tokens": 18240, "output_tokens": 9310, "cost_usd": 0.003585, "baseline_cost_usd": 0.004959 }
  ]
}`;

export const exampleRequestTrace = `{
  "request": {
    "id": "req_7Gk2pQ9sLx4VbN1mZr8TcW3e",
    "createdAt": "2026-10-20T14:03:20.104Z",
    "completedAt": "2026-10-20T14:03:20.744Z",
    "requestedModel": "${M}",
    "modelId": "${M}",
    "offerId": "cm2x8k1f00003l8h1q9z7v6ab",
    "seller": "Example Seller",
    "apiKeyId": "cm2x7z0aa0001l8h1d2e3f4gh",
    "apiKeyName": "backend-prod",
    "source": "API",
    "status": "SUCCESS",
    "stream": false,
    "routingMode": "LOWEST_COST",
    "httpStatus": null,
    "errorCode": null,
    "errorMessage": null,
    "inputTokens": 21,
    "outputTokens": 34,
    "usageEstimated": false,
    "costUsd": 0.000008,
    "baselineCostUsd": 0.00001,
    "holdUsd": 0.000037,
    "latencyMs": 640,
    "ttftMs": null,
    "retryCount": 0,
    "taskId": null,
    "isDemo": false
  },
  "trace": {
    "mode": "LOWEST_COST",
    "explanation": "Selected Example Seller for ${M} by lowest estimated cost among 3 eligible offer(s). ...",
    "ranked": [
      {
        "offer_id": "cm2x8k1f00003l8h1q9z7v6ab",
        "model": "${M}",
        "seller": "Example Seller",
        "demo": false,
        "est_cost_usd": 0.000033,
        "baseline_est_usd": 0.00004,
        "discount_pct": 17.5,
        "p50_latency_ms": 412,
        "reliability": 97,
        "quality": null
      }
    ],
    "rejected": [
      { "offer_id": "cm2x8m3k00007l8h1b5c6d7ef", "model": "${M}", "seller": "Other Seller", "reasons": ["Offer is unhealthy (waiting for a recovery probe)"] }
    ],
    "constraints": {
      "required_capabilities": ["chat"],
      "input_modalities": ["text"],
      "max_input_price_usd_per_m": null,
      "max_output_price_usd_per_m": null,
      "min_discount_pct": null,
      "max_latency_ms": null,
      "min_reliability": null,
      "min_quality_score": null,
      "allowed_providers": [],
      "blocked_providers": [],
      "preferred_providers": [],
      "allow_demo_offers": true
    },
    "estimates": { "input_tokens": 21, "max_output_tokens": 200, "hold_usd": 0.000037 },
    "policy": { "id": null, "name": "Platform default", "max_retries": 2 }
  },
  "attempts": [
    { "attempt": 1, "offer_id": "cm2x8k1f00003l8h1q9z7v6ab", "ok": true, "latency_ms": 612, "status_code": null, "error_code": null, "error": null }
  ]
}`;

export const exampleError = `{
  "error": {
    "message": "Insufficient balance to reserve the worst-case cost of this request.",
    "type": "insufficient_quota",
    "code": "insufficient_balance",
    "param": null,
    "details": {
      "required_hold_usd": 0.004112,
      "available_usd": 0.0012,
      "request_id": "req_Qm3vT8yXo2LkS9dF4hJ1nB6c"
    }
  }
}`;

export const exampleWebhook = `{
  "id": "cm2y1d9q80011l8h1x7w6v5ut",
  "type": "budget.threshold",
  "created_at": "2026-10-20T14:03:21.512Z",
  "org_id": "cm2x6a1b20000l8h1k9j8h7gf",
  "title": "80% of daily budget used",
  "body": "Spent $8.02 of $10.00 daily budget.",
  "data": {
    "threshold": 80,
    "period": "day:2026-10-20",
    "spent_usd": 8.02,
    "limit_usd": 10,
    "project_id": null
  }
}`;

export const exampleWebhookHeaders = `POST /webhooks/nexovra HTTP/1.1
Content-Type: application/json
User-Agent: Nexovra-Webhooks/1.0
Nexovra-Event: budget.threshold
Nexovra-Delivery-Id: cm2y1d9q80011l8h1x7w6v5ut
Nexovra-Signature: t=1760969001,v1=3b6f0c...e91a`;

export const webhookVerification: CodeSample[] = [
  {
    label: 'Node.js',
    language: 'javascript',
    code: `import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.NEXOVRA_WEBHOOK_SECRET; // the full "whsec_..." string
const TOLERANCE_SECONDS = 300;

function verifyNexovraSignature(rawBody, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const app = express();

// Use the raw body: re-serialized JSON will not match the signature.
app.post('/webhooks/nexovra', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody = req.body.toString('utf8');
  if (!verifyNexovraSignature(rawBody, req.get('nexovra-signature'), SECRET)) {
    return res.status(400).send('invalid signature');
  }
  const event = JSON.parse(rawBody);
  // event.id equals the Nexovra-Delivery-Id header; use it to ignore duplicates.
  console.log(event.type, event.title);
  res.sendStatus(200);
});

app.listen(3000);`,
  },
  {
    label: 'Python',
    language: 'python',
    code: `import hashlib
import hmac
import json
import os
import time

from flask import Flask, abort, request

SECRET = os.environ["NEXOVRA_WEBHOOK_SECRET"]  # the full "whsec_..." string
TOLERANCE_SECONDS = 300


def verify_nexovra_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header:
        return False
    parts = {}
    for item in header.split(","):
        key, sep, value = item.partition("=")
        if sep:
            parts[key.strip()] = value.strip()
    try:
        t = int(parts["t"])
    except (KeyError, ValueError):
        return False
    v1 = parts.get("v1")
    if not v1 or abs(int(time.time()) - t) > TOLERANCE_SECONDS:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


app = Flask(__name__)


@app.post("/webhooks/nexovra")
def nexovra_webhook():
    raw_body = request.get_data()  # raw bytes, before any JSON parsing
    if not verify_nexovra_signature(raw_body, request.headers.get("Nexovra-Signature"), SECRET):
        abort(400)
    event = json.loads(raw_body)
    # event["id"] equals the Nexovra-Delivery-Id header; use it to ignore duplicates.
    print(event["type"], event["title"])
    return "", 200`,
  },
];
