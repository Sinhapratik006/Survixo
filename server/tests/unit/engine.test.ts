import { describe, expect, it } from 'vitest';
import { rankCandidates, type Candidate, type Constraints } from '../../src/routing/engine.js';
import { mergeConstraints, DEFAULT_POLICY } from '../../src/routing/policy.js';

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    offerId: 'o1',
    modelId: 'm1',
    modelName: 'Model 1',
    providerId: 'meta',
    sellerOrgId: 'seller-a',
    sellerName: 'Seller A',
    sellerSlug: 'seller-a',
    endpointId: 'e1',
    adapter: 'openai_compatible',
    adapterFeatures: { streaming: true, tools: true, vision: true, jsonMode: true },
    upstreamModel: 'm1',
    inputPrice: 500_000,
    outputPrice: 1_000_000,
    baselineInputPrice: 1_000_000,
    baselineOutputPrice: 2_000_000,
    status: 'ACTIVE',
    endpointStatus: 'VERIFIED',
    validated: true,
    healthStatus: 'HEALTHY',
    verifiedCapabilities: ['chat', 'streaming'],
    modelCapabilities: ['chat', 'streaming', 'tools'],
    inputModalities: ['text'],
    contextWindow: 8192,
    maxOutputTokens: 4096,
    timeoutMs: 30_000,
    isDemo: false,
    stats: { samples: 100, successRate: 0.99, p50LatencyMs: 300, p95LatencyMs: 900 },
    reliabilityScore: 90,
    qualityScore: null,
    inFlight: 0,
    maxConcurrency: 8,
    rpmUsed: 0,
    rpmLimit: 100,
    dailySpendCapMicros: null,
    dailySoldMicros: 0n,
    ...over,
  };
}

function constraints(over: Partial<Constraints> = {}): Constraints {
  return {
    mode: 'LOWEST_COST',
    requiredCapabilities: ['chat'],
    requiredInputModalities: ['text'],
    estInputTokens: 1000,
    estOutputTokens: 500,
    allowedProviders: [],
    blockedProviders: [],
    preferredSellers: [],
    allowDemoOffers: true,
    ...over,
  };
}

describe('routing engine eligibility', () => {
  it('only routes to active, verified, validated, healthy offers', () => {
    const d = rankCandidates(
      [
        candidate({ offerId: 'ok' }),
        candidate({ offerId: 'paused', status: 'PAUSED' }),
        candidate({ offerId: 'unverified', endpointStatus: 'PENDING' }),
        candidate({ offerId: 'unvalidated', validated: false }),
        candidate({ offerId: 'unhealthy', healthStatus: 'UNHEALTHY' }),
      ],
      constraints(),
    );
    expect(d.ranked.map((r) => r.candidate.offerId)).toEqual(['ok']);
    expect(d.rejected).toHaveLength(4);
    expect(d.rejected.find((r) => r.offerId === 'unhealthy')!.reasons[0]).toMatch(/unhealthy/i);
  });

  it('enforces capabilities, modalities and adapter features', () => {
    const d = rankCandidates(
      [
        candidate({ offerId: 'no-vision' }),
        candidate({ offerId: 'vision-model-demo-adapter', modelCapabilities: ['chat', 'vision'], inputModalities: ['text', 'image'], adapterFeatures: { streaming: true, tools: false, vision: false, jsonMode: true } }),
        candidate({ offerId: 'vision-ok', modelCapabilities: ['chat', 'vision'], inputModalities: ['text', 'image'] }),
      ],
      constraints({ requiredCapabilities: ['chat', 'vision'], requiredInputModalities: ['text', 'image'] }),
    );
    expect(d.ranked.map((r) => r.candidate.offerId)).toEqual(['vision-ok']);
    expect(d.rejected.find((r) => r.offerId === 'no-vision')!.reasons).toContain('Model does not support "vision"');
    expect(d.rejected.find((r) => r.offerId === 'vision-model-demo-adapter')!.reasons).toContain('Seller adapter does not support "vision"');
  });

  it('requires streaming to be verified for the offer when streaming is requested', () => {
    const d = rankCandidates([candidate({ verifiedCapabilities: ['chat'] })], constraints({ requiredCapabilities: ['chat', 'streaming'] }));
    expect(d.ranked).toHaveLength(0);
    expect(d.rejected[0]!.reasons).toContain('Streaming was not verified for this offer');
  });

  it('rejects requests that exceed the context window', () => {
    const d = rankCandidates([candidate({ contextWindow: 1000 })], constraints({ estInputTokens: 900, estOutputTokens: 500 }));
    expect(d.ranked).toHaveLength(0);
    expect(d.rejected[0]!.reasons[0]).toMatch(/context window is 1000/);
  });

  it('applies price limits, minimum discount and requires a baseline for discount checks', () => {
    const d = rankCandidates(
      [
        candidate({ offerId: 'cheap', inputPrice: 200_000, outputPrice: 400_000 }),
        candidate({ offerId: 'pricey-out', outputPrice: 3_000_000 }),
        candidate({ offerId: 'small-discount', inputPrice: 900_000, outputPrice: 1_900_000 }),
        candidate({ offerId: 'no-baseline', baselineInputPrice: null, baselineOutputPrice: null }),
      ],
      constraints({ maxOutputPrice: 2_000_000, minDiscountPct: 40 }),
    );
    expect(d.ranked.map((r) => r.candidate.offerId)).toEqual(['cheap']);
    const reasons = Object.fromEntries(d.rejected.map((r) => [r.offerId, r.reasons.join(' | ')]));
    expect(reasons['pricey-out']).toMatch(/Output price exceeds/);
    expect(reasons['small-discount']).toMatch(/below the 40% minimum/);
    expect(reasons['no-baseline']).toMatch(/No baseline price/);
  });

  it('treats unknown latency, reliability and quality as ineligible when a minimum is required', () => {
    const d = rankCandidates(
      [candidate({ stats: { samples: 0, successRate: null, p50LatencyMs: null, p95LatencyMs: null }, reliabilityScore: null, qualityScore: null })],
      constraints({ maxLatencyMs: 1000, minReliability: 50, minQualityScore: 0.5 }),
    );
    expect(d.ranked).toHaveLength(0);
    expect(d.rejected[0]!.reasons).toEqual(['No latency measurements yet', 'Insufficient data for a reliability score', 'No benchmark results for this model']);
  });

  it('respects allowlists, blocklists, demo exclusion and capacity', () => {
    const d = rankCandidates(
      [
        candidate({ offerId: 'a', sellerSlug: 'seller-a' }),
        candidate({ offerId: 'b', sellerOrgId: 'seller-b', sellerSlug: 'seller-b' }),
        candidate({ offerId: 'demo', sellerOrgId: 'seller-a', isDemo: true }),
        candidate({ offerId: 'busy', inFlight: 8 }),
        candidate({ offerId: 'rpm', rpmUsed: 100 }),
      ],
      constraints({ allowedProviders: ['seller-a'], blockedProviders: ['seller-b'], allowDemoOffers: false }),
    );
    expect(d.ranked.map((r) => r.candidate.offerId)).toEqual(['a']);
    const reasons = Object.fromEntries(d.rejected.map((r) => [r.offerId, r.reasons.join(' | ')]));
    expect(reasons.b).toMatch(/allowlist/);
    expect(reasons.demo).toMatch(/Demo offers are excluded/);
    expect(reasons.busy).toMatch(/concurrency limit/);
    expect(reasons.rpm).toMatch(/requests-per-minute/);
  });

  it('explains clearly when nothing is eligible', () => {
    const d = rankCandidates([candidate({ status: 'PAUSED' })], constraints());
    expect(d.ranked).toHaveLength(0);
    expect(d.explanation).toMatch(/No eligible offer among 1 candidate/);
    expect(d.explanation).toMatch(/Offer is paused \(1\)/);
  });
});

describe('routing modes', () => {
  const offers = [
    candidate({ offerId: 'cheap-slow', inputPrice: 100_000, outputPrice: 200_000, stats: { samples: 100, successRate: 1, p50LatencyMs: 2000, p95LatencyMs: 4000 }, qualityScore: 0.6 }),
    candidate({ offerId: 'mid', inputPrice: 300_000, outputPrice: 600_000, stats: { samples: 100, successRate: 1, p50LatencyMs: 300, p95LatencyMs: 600 }, qualityScore: null }),
    candidate({ offerId: 'pricey-fast', sellerOrgId: 'pref', sellerSlug: 'pref', inputPrice: 900_000, outputPrice: 1_800_000, stats: { samples: 100, successRate: 1, p50LatencyMs: 100, p95LatencyMs: 200 }, qualityScore: 0.9 }),
  ];

  it('LOWEST_COST orders by estimated total cost', () => {
    const d = rankCandidates(offers, constraints({ mode: 'LOWEST_COST' }));
    expect(d.ranked.map((r) => r.candidate.offerId)).toEqual(['cheap-slow', 'mid', 'pricey-fast']);
    expect(d.ranked[0]!.estCostMicros).toBe(200n); // 1000 * 0.1 + 500 * 0.2 = 200 micros
    expect(d.explanation).toMatch(/lowest estimated cost/);
  });

  it('BALANCED trades cost against measured latency', () => {
    const d = rankCandidates(offers, constraints({ mode: 'BALANCED' }));
    expect(d.ranked[0]!.candidate.offerId).toBe('mid');
  });

  it('QUALITY_FIRST prefers measured quality and sorts unknown quality last', () => {
    const d = rankCandidates(offers, constraints({ mode: 'QUALITY_FIRST' }));
    expect(d.ranked.map((r) => r.candidate.offerId)).toEqual(['pricey-fast', 'cheap-slow', 'mid']);
  });

  it('PREFERRED_PROVIDER puts preferred sellers first', () => {
    const d = rankCandidates(offers, constraints({ mode: 'PREFERRED_PROVIDER', preferredSellers: ['pref'] }));
    expect(d.ranked[0]!.candidate.offerId).toBe('pricey-fast');
    expect(d.ranked[1]!.candidate.offerId).toBe('cheap-slow');
  });

  it('CUSTOM uses the configured weights', () => {
    const latencyOnly = rankCandidates(offers, constraints({ mode: 'CUSTOM', weights: { price: 0, latency: 1, quality: 0, reliability: 0 } }));
    expect(latencyOnly.ranked[0]!.candidate.offerId).toBe('pricey-fast');
    const priceOnly = rankCandidates(offers, constraints({ mode: 'CUSTOM', weights: { price: 1, latency: 0, quality: 0, reliability: 0 } }));
    expect(priceOnly.ranked[0]!.candidate.offerId).toBe('cheap-slow');
  });

  it('computes discount against the baseline estimate', () => {
    const d = rankCandidates([candidate()], constraints());
    // offer: 1000*0.5 + 500*1.0 = 1000 micros; baseline: 1000*1 + 500*2 = 2000 micros
    expect(d.ranked[0]!.baselineCostMicros).toBe(2000n);
    expect(d.ranked[0]!.discountPct).toBeCloseTo(50);
  });
});

describe('policy merging', () => {
  const base = { requiredCapabilities: ['chat'], requiredInputModalities: ['text'], estInputTokens: 10, estOutputTokens: 10 };

  it('lets requests tighten but never loosen limits', () => {
    const policy = { ...DEFAULT_POLICY, minDiscountPct: 30, maxLatencyMs: 2000, minReliability: 80 };
    const k = mergeConstraints(policy, { min_discount_pct: 10, max_latency_ms: 500, min_reliability: 90 }, base);
    expect(k.minDiscountPct).toBe(30);
    expect(k.maxLatencyMs).toBe(500);
    expect(k.minReliability).toBe(90);
  });

  it('intersects allowlists and keeps an impossible allowlist when the intersection is empty', () => {
    const policy = { ...DEFAULT_POLICY, allowedProviders: ['a', 'b'] };
    expect(mergeConstraints(policy, { allowed_providers: ['b', 'c'] }, base).allowedProviders).toEqual(['b']);
    expect(mergeConstraints(policy, { allowed_providers: ['c'] }, base).allowedProviders).toEqual(['__none__']);
  });

  it('unions blocklists and lets the request choose the mode', () => {
    const policy = { ...DEFAULT_POLICY, blockedProviders: ['x'] };
    const k = mergeConstraints(policy, { blocked_providers: ['y'], routing_mode: 'BALANCED' }, base);
    expect(k.blockedProviders.sort()).toEqual(['x', 'y']);
    expect(k.mode).toBe('BALANCED');
  });
});
