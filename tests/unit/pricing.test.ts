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
  it('buys at 60% and sells at 75% of face value', () => {
    // $100 of credits → the seller receives $60, buyers pay $75, we keep $15.
    expect(CREDIT_BUY_PCT).toBe(60);
    expect(CREDIT_SELL_PCT).toBe(75);
    expect(CREDIT_PLATFORM_MARGIN_PCT).toBe(15);
    expect(sellerPayout(100)).toBe(60);
    expect(buyerPrice(100)).toBe(75);
    expect(platformMargin(100)).toBe(15);
    expect(sellerPayout(100) + platformMargin(100)).toBe(buyerPrice(100));
  });

  it('derives the seller payout from the buyer price the API reports', () => {
    expect(sellerPayoutFromBuyerPrice(75)).toBe(60);
    expect(creditValueFromBuyerPrice(75)).toBe(100);
    // The API returns prices as strings.
    expect(sellerPayoutFromBuyerPrice('75.00')).toBe(60);
    expect(creditValueFromBuyerPrice('75.00')).toBe(100);
  });

  it('handles fractional and empty input safely', () => {
    expect(sellerPayout(0.01)).toBeCloseTo(0.006, 10);
    expect(sellerPayout('')).toBe(0);
    expect(buyerPrice(undefined)).toBe(0);
  });
});
