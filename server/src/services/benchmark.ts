import { prisma } from '../lib/prisma.js';
import { runChatCompletion } from './inference.js';

export const ARITH_BENCHMARK = {
  name: 'nexovra-arith-smoke',
  version: '1.0.0',
  datasetDescription:
    '20 two-operand integer arithmetic questions (addition, subtraction, multiplication) generated deterministically from seed 42. Operands 2–99.',
  method:
    'Each question is sent once as a single user message with temperature 0 and max_tokens 32. A response is correct when the last integer it contains equals the exact answer. Score = correct / total.',
  limitations:
    'Measures basic arithmetic and instruction following only; it is not representative of general model quality, reasoning, coding or factual accuracy. Small sample (n=20). Responses from demo endpoints are synthetic and reflect their configured accuracy, not a real model.',
};

/** Deterministic dataset (LCG with fixed seed) so runs are reproducible. */
export function arithmeticDataset(n = 20, seed = 42) {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s;
  };
  const ops = ['+', '-', '*'] as const;
  return Array.from({ length: n }, () => {
    const a = 2 + (next() % 98);
    const b = 2 + (next() % 98);
    const op = ops[next() % 3]!;
    const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return { question: `What is ${a} ${op} ${b}? Reply with just the number.`, answer };
  });
}

export function gradeArithmetic(response: string, answer: number): boolean {
  const ints = response.replace(/,/g, '').match(/-?\d+/g);
  return Boolean(ints?.length) && Number(ints![ints!.length - 1]) === answer;
}

/**
 * Run the benchmark for one model through the normal marketplace pipeline
 * (billed to the running organization, recorded with source BENCHMARK).
 */
export async function runArithmeticBenchmark(opts: { orgId: string; userId?: string | null; modelId: string; isPublic: boolean }) {
  const dataset = arithmeticDataset();
  let correct = 0;
  let cost = 0;
  let latency = 0;
  let completed = 0;
  let demo = false;
  const offerCounts = new Map<string, number>();
  const errors: string[] = [];

  for (const item of dataset) {
    try {
      const result = await runChatCompletion(
        { orgId: opts.orgId, userId: opts.userId, source: 'BENCHMARK' },
        { model: opts.modelId, messages: [{ role: 'user', content: item.question }], max_tokens: 32, temperature: 0 },
      );
      if (!result) continue;
      completed++;
      if (gradeArithmetic(result.content ?? '', item.answer)) correct++;
      cost += result.meta.cost_usd;
      latency += result.meta.latency_ms;
      demo ||= result.meta.demo;
      offerCounts.set(result.meta.offer_id, (offerCounts.get(result.meta.offer_id) ?? 0) + 1);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (completed < Math.ceil(dataset.length * 0.8)) {
    return { ok: false as const, modelId: opts.modelId, error: `Only ${completed}/${dataset.length} questions completed: ${errors[0] ?? 'unknown error'}` };
  }
  const topOffer = [...offerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const result = await prisma.benchmarkResult.create({
    data: {
      modelId: opts.modelId,
      offerId: topOffer,
      runByOrgId: opts.orgId,
      benchmark: ARITH_BENCHMARK.name,
      version: ARITH_BENCHMARK.version,
      datasetDescription: ARITH_BENCHMARK.datasetDescription,
      method: ARITH_BENCHMARK.method,
      sampleSize: completed,
      score: correct / completed,
      scoreUnit: 'accuracy',
      costMicros: BigInt(Math.round(cost * 1e6)),
      avgLatencyMs: Math.round(latency / completed),
      limitations: ARITH_BENCHMARK.limitations,
      isPublic: opts.isPublic,
      isDemo: demo,
    },
  });
  return { ok: true as const, modelId: opts.modelId, result };
}
