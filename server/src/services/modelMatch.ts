import { blendedPrice, getCatalog, type CatalogModel } from './catalog.js';

export interface TaskAnalysis {
  capabilities: string[];
  minContextTokens: number | null;
  priorities: { cost: number; latency: number; quality: number };
  signals: string[];
}

const TOKENS_PER_PAGE = 600;

/**
 * Rule-based task analysis. Transparent by design: every detected requirement
 * is reported back as a "signal" so users can see why it was inferred.
 */
export function analyzeTask(text: string): TaskAnalysis {
  const t = text.toLowerCase();
  const caps = new Set<string>();
  const signals: string[] = [];
  const priorities = { cost: 1, latency: 1, quality: 1 };
  let minContext: number | null = null;

  const pages = t.match(/(\d{1,5})\s*[- ]?\s*pages?/);
  if (pages) {
    minContext = Number(pages[1]) * TOKENS_PER_PAGE;
    signals.push(`"${pages[0]}" → needs ~${minContext.toLocaleString()} tokens of context (estimate: ${TOKENS_PER_PAGE} tokens per page)`);
  } else if (/\b(book|entire codebase|whole repository|full transcript)\b/.test(t)) {
    minContext = 100_000;
    signals.push('Very long input mentioned → prefers ≥100K-token context');
  } else if (/\b(long|large|lengthy)\s+(document|file|report|pdf|contract)s?\b|\bpdfs?\b/.test(t)) {
    minContext = 32_000;
    signals.push('Long documents mentioned → prefers ≥32K-token context');
  }
  if (/\b(images?|photos?|screenshots?|diagrams?|charts?|vision|visual|pictures?|ocr|scans?|scanned)\b/.test(t)) {
    caps.add('vision');
    signals.push('Visual input mentioned → requires vision support');
  }
  if (/\b(json|structured|schema|extract|extraction|parse)\b/.test(t)) {
    caps.add('json_mode');
    signals.push('Structured output mentioned → requires JSON mode');
  }
  if (/\b(tool|tools|function call|function-call|agent|agents|api calls?)\b/.test(t)) {
    caps.add('tools');
    signals.push('Tool use mentioned → requires tool calling');
  }
  if (/\b(cheap|low[- ]cost|budget|inexpensive|affordable|cost[- ]effective|save money)\b/.test(t)) {
    priorities.cost = 2.5;
    signals.push('Cost sensitivity mentioned → price weighted higher');
  }
  if (/\b(fast|quick|real[- ]?time|low[- ]latency|interactive|chatbot|live)\b/.test(t)) {
    priorities.latency = 2.5;
    signals.push('Responsiveness mentioned → latency weighted higher');
  }
  if (/\b(accurate|accuracy|quality|citations?|precise|reasoning|complex|reliable|correct)\b/.test(t)) {
    priorities.quality = 2.5;
    signals.push('Accuracy mentioned → measured benchmark results weighted higher (only where they exist)');
  }
  if (!signals.length) signals.push('No specific requirements detected; ranking by price, measured latency and measured quality equally');
  return { capabilities: [...caps], minContextTokens: minContext, priorities, signals };
}

export interface MatchInput {
  task: string;
  requiredCapabilities?: string[];
  maxOutputPriceUsd?: number;
  maxLatencyMs?: number;
  limit?: number;
}

export interface Recommendation {
  model: CatalogModel;
  score: number;
  reasons: string[];
  warnings: string[];
}

export async function recommendModels(input: MatchInput) {
  const analysis = analyzeTask(input.task);
  const required = [...new Set([...analysis.capabilities, ...(input.requiredCapabilities ?? [])])];
  const catalog = (await getCatalog()).filter((m) => m.apiSupported && m.capabilities.some((c) => c.capability === 'chat'));
  const excluded: Array<{ modelId: string; name: string; reasons: string[] }> = [];
  const eligible: CatalogModel[] = [];

  for (const m of catalog) {
    const reasons: string[] = [];
    const caps = new Set(m.capabilities.map((c) => c.capability));
    for (const c of required) if (!caps.has(c)) reasons.push(`No declared ${c} support`);
    if (analysis.minContextTokens && m.contextWindow !== null && m.contextWindow < analysis.minContextTokens)
      reasons.push(`Context window ${m.contextWindow.toLocaleString()} < ~${analysis.minContextTokens.toLocaleString()} needed`);
    if (!m.bestOffer) reasons.push('No healthy offer available right now');
    if (input.maxOutputPriceUsd !== undefined && m.bestOffer && m.bestOffer.outputPerM > input.maxOutputPriceUsd)
      reasons.push(`Best output price $${m.bestOffer.outputPerM}/1M exceeds $${input.maxOutputPriceUsd}/1M`);
    if (input.maxLatencyMs !== undefined && m.p50LatencyMs !== null && m.p50LatencyMs > input.maxLatencyMs)
      reasons.push(`Median latency ${m.p50LatencyMs} ms exceeds ${input.maxLatencyMs} ms`);
    if (reasons.length) excluded.push({ modelId: m.id, name: m.name, reasons });
    else eligible.push(m);
  }

  const prices = eligible.map((m) => blendedPrice(m.bestOffer!.inputPerM, m.bestOffer!.outputPerM));
  const lats = eligible.map((m) => m.p50LatencyMs);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const knownLat = lats.filter((l): l is number => l !== null);
  const minL = Math.min(...knownLat);
  const maxL = Math.max(...knownLat);
  const w = analysis.priorities;

  const recs: Recommendation[] = eligible.map((m, i) => {
    const priceScore = maxP === minP ? 1 : 1 - (prices[i]! - minP) / (maxP - minP);
    const latScore = lats[i] === null ? 0.5 : maxL === minL ? 1 : 1 - (lats[i]! - minL) / (maxL - minL);
    const qualityScore = m.qualityScore ?? 0.5;
    const score = (w.cost * priceScore + w.latency * latScore + w.quality * qualityScore) / (w.cost + w.latency + w.quality);

    const reasons: string[] = [];
    const warnings: string[] = [];
    const b = m.bestOffer!;
    reasons.push(`Cheapest healthy offer: $${b.inputPerM}/1M input, $${b.outputPerM}/1M output${b.discountPct !== null ? ` (${b.discountPct}% below the baseline reference)` : ''}`);
    for (const c of required) {
      const cap = m.capabilities.find((x) => x.capability === c);
      reasons.push(`${c} support ${cap?.status === 'verified' ? 'verified by Nexovra' : 'declared in catalog (not independently verified)'}`);
    }
    if (m.contextWindow) reasons.push(`Context window ${m.contextWindow.toLocaleString()} tokens`);
    else warnings.push('Context window unknown');
    if (m.p50LatencyMs !== null) reasons.push(`Measured median latency ${m.p50LatencyMs} ms`);
    else warnings.push('No latency measurements yet');
    if (m.qualityScore !== null) reasons.push(`Measured benchmark score ${(m.qualityScore * 100).toFixed(0)}% (see Benchmarks for method and limitations)`);
    else warnings.push('No benchmark results - quality has not been measured; run an evaluation before relying on it');
    if (m.isDemo || b.isDemo) warnings.push('Demo data: offer and/or prices are illustrative');
    return { model: m, score: Number(score.toFixed(4)), reasons, warnings };
  });

  recs.sort((a, b) => b.score - a.score);
  return {
    analysis: { ...analysis, requiredCapabilities: required },
    recommendations: recs.slice(0, input.limit ?? 5),
    excluded: excluded.slice(0, 15),
    method:
      'Hard requirements filter the catalog; remaining models are scored by price, measured latency and measured benchmark quality, weighted by priorities detected in your description. Models without measurements receive a neutral score for that factor. No model has been tested by this assistant.',
  };
}
