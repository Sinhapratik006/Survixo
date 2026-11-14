/**
 * Marketplace credit pricing — the single source of truth for how the
 * platform buys and sells API credits.
 *
 * A listing is priced from the *face value* of the API credits being sold.
 * The platform buys those credits from the seller at 32% of face value and
 * resells them to buyers at 76% of face value:
 *
 *   face value   $50.00    what the credits are worth
 *   seller       $16.00    32% — what we pay the seller
 *   buyer        $38.00    76% — what buyers pay
 *   platform     $22.00    44% — our margin (~57.9% of the sale price)
 *
 * Listings store only the buyer price (`priceCents`), so the payout side is
 * derived from it: seller = price × 32/76, platform = price − seller. Every
 * monetary value on the marketplace flows through these helpers so the
 * numbers shown in the UI always match the numbers booked on an order.
 */

/** Share of face value paid out to the seller. */
export const CREDIT_BUY_RATE = 0.32;
/** Share of face value charged to the buyer. */
export const CREDIT_SELL_RATE = 0.76;
/** Share of face value kept by the platform (SELL − BUY = 44%). */
export const CREDIT_PLATFORM_MARGIN_RATE = 0.44;

/** Face value in cents → what the buyer pays, in cents. */
export function buyerPriceCents(creditValueCents: number): number {
  if (!Number.isFinite(creditValueCents) || creditValueCents <= 0) return 0;
  return Math.max(1, Math.round(creditValueCents * CREDIT_SELL_RATE));
}

/** Buyer price in cents → the face value it represents, in cents. */
export function creditValueCentsFromPrice(priceCents: number): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return 0;
  return Math.round(priceCents / CREDIT_SELL_RATE);
}

/** Buyer price in cents → the seller's share, in cents (32% of face value). */
export function sellerEarningCentsFromPrice(priceCents: number): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return 0;
  return Math.round(priceCents * (CREDIT_BUY_RATE / CREDIT_SELL_RATE));
}

/** Buyer price in cents → the platform's share, in cents (44% of face value). */
export function platformFeeCentsFromPrice(priceCents: number): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return 0;
  return priceCents - sellerEarningCentsFromPrice(priceCents);
}
