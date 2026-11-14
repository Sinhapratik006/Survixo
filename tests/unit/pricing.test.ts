import { describe, expect, it } from 'vitest';
import {
  CREDIT_BUY_PCT,
  CREDIT_PLATFORM_MARGIN_PCT,
  CREDIT_SELL_PCT,
  buyerPrice,
  creditValueFromBuyerPrice,
  platformMargin,
  sellerPayout,
  sellerPayoutFromBuyerPrice,
} from '../../lib/pricing';

describe('marketplace credit pricing (web)', () => {
  it('buys at 32% and sells at 76% of face value', () => {
    // $50 of credits → the seller receives $16, buyers pay $38, we keep $22.
    expect(CREDIT_BUY_PCT).toBe(32);
    expect(CREDIT_SELL_PCT).toBe(76);
    expect(CREDIT_PLATFORM_MARGIN_PCT).toBe(44);
    expect(sellerPayout(50)).toBe(16);
    expect(buyerPrice(50)).toBe(38);
    expect(platformMargin(50)).toBe(22);
    expect(sellerPayout(50) + platformMargin(50)).toBe(buyerPrice(50));
  });

  it('derives the seller payout from the buyer price the API reports', () => {
    expect(sellerPayoutFromBuyerPrice(38)).toBe(16);
    expect(creditValueFromBuyerPrice(38)).toBe(50);
    // The API returns prices as strings.
    expect(sellerPayoutFromBuyerPrice('38.00')).toBe(16);
    expect(creditValueFromBuyerPrice('38.00')).toBe(50);
  });

  it('handles fractional and empty input safely', () => {
    expect(sellerPayout(0.01)).toBeCloseTo(0.0032, 10);
    expect(sellerPayout('')).toBe(0);
    expect(buyerPrice(undefined)).toBe(0);
  });
});
