/**
 * Marketplace credit pricing (web mirror of server/src/lib/pricing.tsx).
 *
 * A seller lists the face value of their API credits; the platform buys them
 * at 32% of face value and resells them to buyers at 76% of face value:
 *
 *   $50 of credits → the seller receives $16, buyers pay $38,
 *   the platform keeps $22.
 *
 * Listings only store the buyer price, so payout-side numbers are derived
 * from it with the *FromPrice helpers.
 */

/** Share of face value paid out to the seller. */
export const CREDIT_BUY_RATE = 0.32;
/** Share of face value charged to the buyer. */
export const CREDIT_SELL_RATE = 0.76;
/** Share of face value kept by the platform (SELL − BUY). */
export const CREDIT_PLATFORM_MARGIN_RATE = 0.44;

export const CREDIT_BUY_PCT = Math.round(CREDIT_BUY_RATE * 100);
export const CREDIT_SELL_PCT = Math.round(CREDIT_SELL_RATE * 100);
export const CREDIT_PLATFORM_MARGIN_PCT = Math.round(CREDIT_PLATFORM_MARGIN_RATE * 100);

/** Coerce form/API input to a usable dollar amount. */
function toUsd(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Face value in USD → what the seller receives per sale. */
export function sellerPayout(creditValueUsd) {
  return toUsd(creditValueUsd) * CREDIT_BUY_RATE;
}

/** Face value in USD → what buyers pay. */
export function buyerPrice(creditValueUsd) {
  return toUsd(creditValueUsd) * CREDIT_SELL_RATE;
}

/** Face value in USD → what the platform keeps. */
export function platformMargin(creditValueUsd) {
  return toUsd(creditValueUsd) * CREDIT_PLATFORM_MARGIN_RATE;
}

/** Buyer price in USD → the face value it represents. */
export function creditValueFromBuyerPrice(priceUsd) {
  return toUsd(priceUsd) / CREDIT_SELL_RATE;
}

/** Buyer price in USD → the seller's share (32% of face value). */
export function sellerPayoutFromBuyerPrice(priceUsd) {
  return (toUsd(priceUsd) * CREDIT_BUY_RATE) / CREDIT_SELL_RATE;
}
