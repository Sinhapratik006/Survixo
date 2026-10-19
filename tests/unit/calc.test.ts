import { applyDiscount, blendedPerM, estimateSavings, splitTokens, tokenCost, tokensFromSpend } from '@/features/calculator/calc';

describe('tokenCost', () => {
  it('prices input and output tokens per million', () => {
    expect(tokenCost(2_000_000, 1_000_000, 0.5, 1.5)).toBeCloseTo(2.5, 10);
  });

  it('handles fractional millions', () => {
    expect(tokenCost(1500, 500, 2, 6)).toBeCloseTo(0.003 + 0.003, 12);
  });

  it('returns 0 for zero tokens', () => {
    expect(tokenCost(0, 0, 10, 30)).toBe(0);
  });

  it('treats negative token counts as zero', () => {
    expect(tokenCost(-1_000_000, 1_000_000, 1, 2)).toBeCloseTo(2, 10);
    expect(tokenCost(1_000_000, -5, 1, 2)).toBeCloseTo(1, 10);
  });

  it('is linear in volume', () => {
    const one = tokenCost(1_000_000, 250_000, 0.3, 1.2);
    expect(tokenCost(10_000_000, 2_500_000, 0.3, 1.2)).toBeCloseTo(one * 10, 10);
  });
});

describe('splitTokens', () => {
  it('splits by input share', () => {
    expect(splitTokens(1_000_000, 0.75)).toEqual({ inputTokens: 750_000, outputTokens: 250_000 });
  });

  it('always sums to the (rounded) total', () => {
    for (const share of [0, 0.1, 0.33, 0.5, 0.77, 1]) {
      const { inputTokens, outputTokens } = splitTokens(999_999, share);
      expect(inputTokens + outputTokens).toBe(999_999);
    }
  });

  it('rounds to whole tokens', () => {
    const { inputTokens, outputTokens } = splitTokens(10, 1 / 3);
    expect(Number.isInteger(inputTokens)).toBe(true);
    expect(Number.isInteger(outputTokens)).toBe(true);
    expect(inputTokens).toBe(3);
    expect(outputTokens).toBe(7);
  });

  it('clamps the share to [0, 1]', () => {
    expect(splitTokens(100, 1.5)).toEqual({ inputTokens: 100, outputTokens: 0 });
    expect(splitTokens(100, -0.2)).toEqual({ inputTokens: 0, outputTokens: 100 });
  });
});

describe('blendedPerM', () => {
  it('weights input and output prices by share', () => {
    expect(blendedPerM(1, 3, 0.75)).toBeCloseTo(1.5, 10);
    expect(blendedPerM(1, 3, 0)).toBe(3);
    expect(blendedPerM(1, 3, 1)).toBe(1);
  });

  it('clamps the share', () => {
    expect(blendedPerM(1, 3, 2)).toBe(1);
    expect(blendedPerM(1, 3, -1)).toBe(3);
  });
});

describe('tokensFromSpend', () => {
  it('converts spend to tokens at the blended baseline price', () => {
    // blended = 0.75 × $1 + 0.25 × $3 = $1.50 per 1M → $150 buys 100M tokens
    expect(tokensFromSpend(150, 1, 3, 0.75)).toBe(100_000_000);
  });

  it('round-trips with splitTokens + tokenCost', () => {
    const spend = 437.25;
    const [inP, outP, share] = [0.8, 2.4, 0.7];
    const total = tokensFromSpend(spend, inP, outP, share);
    const { inputTokens, outputTokens } = splitTokens(total, share);
    expect(tokenCost(inputTokens, outputTokens, inP, outP)).toBeCloseTo(spend, 4);
  });

  it('returns 0 when the blended price is zero', () => {
    expect(tokensFromSpend(100, 0, 0, 0.5)).toBe(0);
  });

  it('treats negative spend as zero', () => {
    expect(tokensFromSpend(-50, 1, 2, 0.5)).toBe(0);
  });
});

describe('estimateSavings', () => {
  const baseline = { inputPerM: 1, outputPerM: 3 };
  const marketplace = { inputPerM: 0.6, outputPerM: 1.8 };

  it('computes baseline, marketplace cost, savings and percentage', () => {
    const e = estimateSavings({ inputTokens: 3_000_000, outputTokens: 1_000_000, baseline, marketplace });
    expect(e.baselineUsd).toBeCloseTo(6, 10);
    expect(e.marketplaceUsd).toBeCloseTo(3.6, 10);
    expect(e.buyerFeesUsd).toBe(0);
    expect(e.savingsUsd).toBeCloseTo(2.4, 10);
    expect(e.savingsPct).toBeCloseTo(40, 10);
    expect(e.inputTokens).toBe(3_000_000);
    expect(e.outputTokens).toBe(1_000_000);
  });

  it('adds a buyer-side fee on top of the offer cost', () => {
    const e = estimateSavings({ inputTokens: 3_000_000, outputTokens: 1_000_000, baseline, marketplace, buyerFeeRate: 0.1 });
    expect(e.buyerFeesUsd).toBeCloseTo(0.36, 10);
    expect(e.marketplaceUsd).toBeCloseTo(3.96, 10);
    expect(e.savingsUsd).toBeCloseTo(2.04, 10);
    expect(e.savingsPct).toBeCloseTo(34, 10);
  });

  it('ignores negative fee rates', () => {
    const e = estimateSavings({ inputTokens: 1_000_000, outputTokens: 0, baseline, marketplace, buyerFeeRate: -0.5 });
    expect(e.buyerFeesUsd).toBe(0);
    expect(e.marketplaceUsd).toBeCloseTo(0.6, 10);
  });

  it('reports 0% when the baseline cost is zero', () => {
    const e = estimateSavings({ inputTokens: 1_000_000, outputTokens: 1_000_000, baseline: { inputPerM: 0, outputPerM: 0 }, marketplace });
    expect(e.baselineUsd).toBe(0);
    expect(e.savingsPct).toBe(0);
    expect(e.savingsUsd).toBeCloseTo(-2.4, 10);
  });

  it('reports negative savings when the marketplace is more expensive', () => {
    const e = estimateSavings({ inputTokens: 1_000_000, outputTokens: 1_000_000, baseline: marketplace, marketplace: baseline });
    expect(e.savingsUsd).toBeLessThan(0);
    expect(e.savingsPct).toBeCloseTo((-1.6 / 2.4) * 100, 10);
  });

  it('reports zero for zero volume', () => {
    const e = estimateSavings({ inputTokens: 0, outputTokens: 0, baseline, marketplace });
    expect(e.baselineUsd).toBe(0);
    expect(e.marketplaceUsd).toBe(0);
    expect(e.savingsUsd).toBe(0);
    expect(e.savingsPct).toBe(0);
  });
});

describe('applyDiscount', () => {
  const baseline = { inputPerM: 2, outputPerM: 8 };

  it('applies a percentage discount to both prices', () => {
    const p = applyDiscount(baseline, 25);
    expect(p.inputPerM).toBeCloseTo(1.5, 10);
    expect(p.outputPerM).toBeCloseTo(6, 10);
  });

  it('clamps discounts above 100% to free', () => {
    expect(applyDiscount(baseline, 150)).toEqual({ inputPerM: 0, outputPerM: 0 });
  });

  it('clamps negative discounts to the baseline', () => {
    expect(applyDiscount(baseline, -20)).toEqual(baseline);
  });

  it('returns the baseline for 0%', () => {
    expect(applyDiscount(baseline, 0)).toEqual(baseline);
  });
});
