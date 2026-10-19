import { describe, expect, it } from 'vitest';
import { feeSplit, microsToUsd, tokenCostMicros, usdToMicros } from '../../src/lib/money.js';
import { computeReliability, latencyComponent, wilsonLowerBound, RELIABILITY_MIN_SAMPLES } from '../../src/services/reliability.js';
import { backoffMs } from '../../src/services/offerHealth.js';
import { estimatePromptTokens, estimateTextTokens } from '../../src/routing/tokens.js';
import { analyzeTask } from '../../src/services/modelMatch.js';
import { arithmeticDataset, gradeArithmetic } from '../../src/services/benchmark.js';

describe('token cost accounting', () => {
  it('computes exact micro-USD costs', () => {
    // 1M input @ $0.50/M + 1M output @ $1.50/M = $2.00
    expect(tokenCostMicros(1_000_000, 1_000_000, 500_000, 1_500_000)).toBe(2_000_000n);
    // 1000 input @ $0.18/M + 500 output @ $0.18/M = 0.00027 USD = 270 micros
    expect(tokenCostMicros(1000, 500, 180_000, 180_000)).toBe(270n);
  });

  it('rounds fractional micros up so no cost is lost', () => {
    expect(tokenCostMicros(1, 0, 1, 0)).toBe(1n);
    expect(tokenCostMicros(0, 0, 1_000_000, 1_000_000)).toBe(0n);
  });

  it('splits seller earnings and platform fee without losing micros', () => {
    const { fee, seller } = feeSplit(1_000_003n, 500);
    expect(fee).toBe(50_000n);
    expect(seller + fee).toBe(1_000_003n);
  });

  it('converts between USD and micros', () => {
    expect(usdToMicros(1.234567)).toBe(1_234_567n);
    expect(microsToUsd(2_500_000n)).toBe(2.5);
    expect(() => usdToMicros(Number.NaN)).toThrow();
  });
});

describe('reliability score', () => {
  it('returns no score below the minimum sample size', () => {
    const r = computeReliability({ requestAttempts: 10, requestSuccesses: 10, healthChecks: 5, healthChecksOk: 5, p95LatencyMs: 300 });
    expect(r.score).toBeNull();
    expect(r.sampleSize).toBe(15);
    expect(r.explanation).toMatch(`at least ${RELIABILITY_MIN_SAMPLES}`);
  });

  it('penalizes small samples via the Wilson lower bound', () => {
    expect(wilsonLowerBound(30, 30)).toBeLessThan(wilsonLowerBound(1000, 1000));
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('combines success lower bound and latency', () => {
    const r = computeReliability({ requestAttempts: 1000, requestSuccesses: 1000, healthChecks: 0, healthChecksOk: 0, p95LatencyMs: 500 });
    expect(r.score).toBeGreaterThanOrEqual(99);
    const slow = computeReliability({ requestAttempts: 1000, requestSuccesses: 1000, healthChecks: 0, healthChecksOk: 0, p95LatencyMs: 10_000 });
    expect(slow.score).toBeLessThanOrEqual(80);
    expect(latencyComponent(null)).toBeNull();
    expect(latencyComponent(5500)).toBeCloseTo(0.5);
  });
});

describe('health backoff ladder', () => {
  it('grows with consecutive failures and caps at one hour', () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(3)).toBe(5 * 60_000);
    expect(backoffMs(50)).toBe(60 * 60_000);
    expect(backoffMs(4, 'rate_limited')).toBe(30_000);
  });
});

describe('token estimation', () => {
  it('estimates roughly four characters per token', () => {
    expect(estimateTextTokens('')).toBe(0);
    expect(estimateTextTokens('abcd')).toBe(1);
    expect(estimatePromptTokens([{ role: 'user', content: 'a'.repeat(400) }])).toBe(3 + 4 + 100);
  });

  it('accounts for image parts', () => {
    const t = estimatePromptTokens([{ role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: 'https://x/y.png' } }] }]);
    expect(t).toBeGreaterThan(1000);
  });
});

describe('model match task analysis', () => {
  it('extracts requirements from the example task', () => {
    const a = analyzeTask('Summarize 200-page PDFs with accurate citations at low cost.');
    expect(a.minContextTokens).toBe(120_000);
    expect(a.priorities.cost).toBeGreaterThan(1);
    expect(a.priorities.quality).toBeGreaterThan(1);
    expect(a.signals.length).toBeGreaterThan(2);
  });

  it('detects vision, JSON and tool requirements', () => {
    const a = analyzeTask('Extract JSON fields from screenshots and call tools in an agent loop');
    expect(a.capabilities.sort()).toEqual(['json_mode', 'tools', 'vision']);
  });
});

describe('arithmetic benchmark', () => {
  it('generates a deterministic dataset', () => {
    expect(arithmeticDataset()).toEqual(arithmeticDataset());
    expect(arithmeticDataset()).toHaveLength(20);
  });

  it('grades the last integer in a response', () => {
    expect(gradeArithmetic('The answer is 42.', 42)).toBe(true);
    expect(gradeArithmetic('12 + 30 = 42', 42)).toBe(true);
    expect(gradeArithmetic('It is 1,234', 1234)).toBe(true);
    expect(gradeArithmetic('The answer is 41.', 42)).toBe(false);
    expect(gradeArithmetic('no idea', 42)).toBe(false);
  });
});
