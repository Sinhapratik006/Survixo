import { describe, expect, it } from 'vitest';
import {
  CREDIT_BUY_RATE,
  CREDIT_PLATFORM_MARGIN_RATE,
  CREDIT_SELL_RATE,
  buyerPriceCents,
  creditValueCentsFromPrice,
  platformFeeCentsFromPrice,
  sellerEarningCentsFromPrice,
} from '../../src/lib/pricing.js';

describe('marketplace credit pricing', () => {
  it('buys credits at 32% and sells them at 76% of face value', () => {
    // $50 of credits → we pay the seller $16, buyers pay $38, we keep $22.
    const face = 5_000; // cents
    const price = buyerPriceCents(face);
    expect(price).toBe(3_800);
    expect(sellerEarningCentsFromPrice(price)).toBe(1_600);
    expect(platformFeeCentsFromPrice(price)).toBe(2_200);
  });

  it('keeps the published rates internally consistent', () => {
    expect(CREDIT_BUY_RATE).toBeCloseTo(0.32, 10);
    expect(CREDIT_SELL_RATE).toBeCloseTo(0.76, 10);
    expect(CREDIT_PLATFORM_MARGIN_RATE).toBeCloseTo(0.44, 10);
    // The margin is exactly the gap between what we pay and what we charge.
    expect(CREDIT_BUY_RATE + CREDIT_PLATFORM_MARGIN_RATE).toBeCloseTo(CREDIT_SELL_RATE, 10);
  });

  it('splits every sale price without losing or inventing a cent', () => {
    for (let price = 1; price <= 5_000; price++) {
      expect(sellerEarningCentsFromPrice(price) + platformFeeCentsFromPrice(price)).toBe(price);
    }
  });

  it('prices within half a cent of the requested rates', () => {
    for (const face of [1, 7, 99, 100, 12_345, 1_000_000]) {
      const price = buyerPriceCents(face);
      expect(Math.abs(price - face * CREDIT_SELL_RATE)).toBeLessThanOrEqual(0.5);
      const payout = sellerEarningCentsFromPrice(price);
      expect(Math.abs(payout - face * CREDIT_BUY_RATE)).toBeLessThanOrEqual(1);
    }
  });

  it('round-trips face value through the buyer price', () => {
    for (const face of [1, 99, 100, 10_000, 250_000]) {
      const derived = creditValueCentsFromPrice(buyerPriceCents(face));
      expect(Math.abs(derived - face)).toBeLessThanOrEqual(1);
    }
    // Exact for the headline case: $50 → $38 → $50.
    expect(creditValueCentsFromPrice(buyerPriceCents(5_000))).toBe(5_000);
  });

  it('never sells below one cent and treats invalid input as zero', () => {
    expect(buyerPriceCents(1)).toBe(1);
    expect(buyerPriceCents(0)).toBe(0);
    expect(buyerPriceCents(-100)).toBe(0);
    expect(buyerPriceCents(Number.NaN)).toBe(0);
    expect(sellerEarningCentsFromPrice(0)).toBe(0);
    expect(platformFeeCentsFromPrice(Number.NaN)).toBe(0);
    expect(creditValueCentsFromPrice(0)).toBe(0);
  });
});
