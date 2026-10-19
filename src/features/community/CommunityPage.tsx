import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, FolderGit2, Info } from 'lucide-react';
import { Alert, ButtonLink, Card, CodeBlock, EmptyState, PageHeader, type CodeSample } from '@/components/ui';
import { cn } from '@/lib/cn';
import { EXAMPLE_MODEL, useApiBaseUrl } from '@/features/home/snippets';

interface Recipe {
  id: string;
  name: string;
  language: string;
  install: string;
  note: string;
  samples: (baseUrl: string) => CodeSample[];
}

const RECIPES: Recipe[] = [
  {
    id: 'openai-python',
    name: 'OpenAI Python SDK',
    language: 'Python',
    install: 'pip install openai',
    note: 'Pass Nexovra routing options with extra_body; read them back from response.model_extra.',
    samples: (b) => [
      {
        label: 'Python',
        language: 'python',
        code: `import os
from openai import OpenAI

client = OpenAI(base_url="${b}", api_key=os.environ["NEXOVRA_API_KEY"])

stream = client.chat.completions.create(
    model="${EXAMPLE_MODEL}",
    messages=[{"role": "user", "content": "Explain idempotency keys in two sentences."}],
    stream=True,
    stream_options={"include_usage": True},
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`,
      },
    ],
  },
  {
    id: 'openai-node',
    name: 'OpenAI Node SDK',
    language: 'TypeScript',
    install: 'npm install openai',
    note: 'The SDK types do not know the nexovra field, so cast the params object when you add it.',
    samples: (b) => [
      {
        label: 'TypeScript',
        language: 'typescript',
        code: `import OpenAI from 'openai';

const client = new OpenAI({ baseURL: '${b}', apiKey: process.env.NEXOVRA_API_KEY });

const stream = await client.chat.completions.create({
  model: '${EXAMPLE_MODEL}',
  messages: [{ role: 'user', content: 'Explain idempotency keys in two sentences.' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}`,
      },
    ],
  },
  {
    id: 'vercel-ai',
    name: 'Vercel AI SDK',
    language: 'TypeScript',
    install: 'npm install ai @ai-sdk/openai',
    note: 'Use provider.chat(model) so requests go to /chat/completions rather than the Responses API.',
    samples: (b) => [
      {
        label: 'TypeScript',
        language: 'typescript',
        code: `import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const nexovra = createOpenAI({
  baseURL: '${b}',
  apiKey: process.env.NEXOVRA_API_KEY,
});

const { text, usage } = await generateText({
  model: nexovra.chat('${EXAMPLE_MODEL}'),
  prompt: 'List three ways to reduce prompt size.',
});

console.log(text, usage);`,
      },
    ],
  },
  {
    id: 'langchain',
    name: 'LangChain',
    language: 'Python · TypeScript',
    install: 'pip install langchain-openai  ·  npm install @langchain/openai',
    note: 'ChatOpenAI accepts a custom base URL in both the Python and JavaScript packages.',
    samples: (b) => [
      {
        label: 'Python',
        language: 'python',
        code: `import os
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="${EXAMPLE_MODEL}",
    base_url="${b}",
    api_key=os.environ["NEXOVRA_API_KEY"],
)

print(llm.invoke("Give me a one-line definition of a vector index.").content)`,
      },
      {
        label: 'TypeScript',
        language: 'typescript',
        code: `import { ChatOpenAI } from '@langchain/openai';

const llm = new ChatOpenAI({
  model: '${EXAMPLE_MODEL}',
  apiKey: process.env.NEXOVRA_API_KEY,
  configuration: { baseURL: '${b}' },
});

const reply = await llm.invoke('Give me a one-line definition of a vector index.');
console.log(reply.content);`,
      },
    ],
  },
  {
    id: 'llamaindex',
    name: 'LlamaIndex',
    language: 'Python',
    install: 'pip install llama-index-llms-openai-like',
    note: 'OpenAILike skips OpenAI model-name validation; set is_chat_model and the context window yourself.',
    samples: (b) => [
      {
        label: 'Python',
        language: 'python',
        code: `import os
from llama_index.llms.openai_like import OpenAILike

llm = OpenAILike(
    model="${EXAMPLE_MODEL}",
    api_base="${b}",
    api_key=os.environ["NEXOVRA_API_KEY"],
    is_chat_model=True,
    context_window=8192,  # set to the model's context window from the catalog
)

print(llm.complete("Summarize retrieval-augmented generation in one sentence."))`,
      },
    ],
  },
  {
    id: 'curl',
    name: 'cURL',
    language: 'Shell',
    install: 'No installation required',
    note: 'The -N flag disables buffering so streamed events print as they arrive.',
    samples: (b) => [
      {
        label: 'cURL',
        language: 'bash',
        code: `curl -N ${b}/chat/completions \\
  -H "Authorization: Bearer $NEXOVRA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${EXAMPLE_MODEL}",
    "stream": true,
    "messages": [{"role": "user", "content": "Say hello in three languages."}],
    "nexovra": {"routing_mode": "balanced", "max_latency_ms": 2000}
  }'

# List models available through the API
curl ${b}/models -H "Authorization: Bearer $NEXOVRA_API_KEY"`,
      },
    ],
  },
];

export default function CommunityPage() {
  const baseUrl = useApiBaseUrl();
  const [active, setActive] = useState(RECIPES[0]!.id);
  const recipe = RECIPES.find((r) => r.id === active) ?? RECIPES[0]!;

  useEffect(() => {
    document.title = 'Community · Nexovra';
  }, []);

  return (
    <div className="container-page py-10">
      <PageHeader
        title="Community projects and integrations"
        description="Connect popular SDKs and frameworks to the marketplace with standard OpenAI-compatible settings: a base URL and an API key read from the environment."
        actions={
          <ButtonLink to="/docs" variant="outline" leftIcon={<BookOpen className="h-4 w-4" aria-hidden />}>
            API reference
          </ButtonLink>
        }
      />

      <Alert tone="info" title="About compatibility" className="mb-8">
        These recipes only rely on standard OpenAI-compatible settings. Each tool's own features — agents, tool calling helpers, structured output modes, embeddings and so on — may or may not work, and their
        compatibility is not guaranteed. Test with your workload before relying on it.
      </Alert>

      <section aria-labelledby="recipes-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="recipes-heading" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Integration recipes
          </h2>
          <p className="text-sm text-muted">
            Base URL: <code className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-800 dark:bg-navy-700 dark:text-brand-200">{baseUrl}</code>
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <nav aria-label="Integrations">
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {RECIPES.map((r) => (
                <li key={r.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActive(r.id)}
                    aria-current={r.id === active ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                      r.id === active
                        ? 'border-cyan-400 bg-white ring-1 ring-cyan-300 dark:border-cyan-600 dark:bg-navy-800 dark:ring-cyan-800'
                        : 'border-brand-100 bg-white hover:border-brand-300 dark:border-navy-600 dark:bg-navy-800 dark:hover:border-navy-500',
                    )}
                  >
                    <span className="block text-sm font-medium text-slate-900 dark:text-white">{r.name}</span>
                    <span className="block text-xs text-muted">{r.language}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0">
            <Card className="p-5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{recipe.name}</h3>
              <p className="mt-1 text-sm text-muted">
                Install: <code className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-800 dark:bg-navy-700 dark:text-brand-200">{recipe.install}</code>
              </p>
              <CodeBlock key={recipe.id} samples={recipe.samples(baseUrl)} className="mt-4" />
              <p className="mt-3 flex gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
                {recipe.note}
              </p>
            </Card>
            <p className="mt-3 text-xs text-muted">
              Create a key under API keys in the dashboard and export it as <code>NEXOVRA_API_KEY</code>. Never paste keys into source files or client-side code.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="showcase-heading" className="mt-14">
        <h2 id="showcase-heading" className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Project showcase
        </h2>
        <p className="mt-1 text-sm text-muted">Open-source projects, plugins and templates built on the marketplace API.</p>
        <Card className="mt-5">
          <EmptyState
            icon={<FolderGit2 className="h-5 w-5" aria-hidden />}
            title="No community projects are listed yet"
            description="Projects are only shown after they are verified. Built something with the API? Send us a link and a short description through support."
            action={
              <ButtonLink to="/support" variant="outline">
                Submit a project <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            }
          />
        </Card>
      </section>
    </div>
  );
}
