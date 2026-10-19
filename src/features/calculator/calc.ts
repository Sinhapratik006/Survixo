/**
 * Inference cost math used by the savings calculator and comparisons.
 *
 *   cost = inputTokens / 1,000,000 × inputPricePerM
 *        + outputTokens / 1,000,000 × outputPricePerM
 */
export function tokenCost(inputTokens: number, outputTokens: number, inputPerM: number, outputPerM: number): number {
  return (Math.max(0, inputTokens) / 1_000_000) * inputPerM + (Math.max(0, outputTokens) / 1_000_000) * outputPerM;
}

/** Split a total token volume by input share (0..1). */
export function splitTokens(totalTokens: number, inputShare: number): { inputTokens: number; outputTokens: number } {
  const share = Math.min(1, Math.max(0, inputShare));
  const inputTokens = Math.round(totalTokens * share);
  return { inputTokens, outputTokens: Math.max(0, Math.round(totalTokens) - inputTokens) };
}

/** Blended USD price per 1M tokens for a given input share. */
export function blendedPerM(inputPerM: number, outputPerM: number, inputShare: number): number {
  const share = Math.min(1, Math.max(0, inputShare));
  return inputPerM * share + outputPerM * (1 - share);
}

/** Token volume implied by a monthly spend at baseline prices. */
export function tokensFromSpend(monthlySpendUsd: number, inputPerM: number, outputPerM: number, inputShare: number): number {
  const blended = blendedPerM(inputPerM, outputPerM, inputShare);
  if (blended <= 0) return 0;
  return Math.round((Math.max(0, monthlySpendUsd) / blended) * 1_000_000);
}

export interface SavingsEstimate {
  inputTokens: number;
  outputTokens: number;
  baselineUsd: number;
  marketplaceUsd: number;
  buyerFeesUsd: number;
  savingsUsd: number;
  savingsPct: number;
}

export function estimateSavings(input: {
  inputTokens: number;
  outputTokens: number;
  baseline: { inputPerM: number; outputPerM: number };
  marketplace: { inputPerM: number; outputPerM: number };
  /** Buyer-side fee as a fraction of marketplace cost (Nexovra charges 0: the platform fee is deducted from seller earnings). */
  buyerFeeRate?: number;
}): SavingsEstimate {
  const baselineUsd = tokenCost(input.inputTokens, input.outputTokens, input.baseline.inputPerM, input.baseline.outputPerM);
  const offerUsd = tokenCost(input.inputTokens, input.outputTokens, input.marketplace.inputPerM, input.marketplace.outputPerM);
  const buyerFeesUsd = offerUsd * Math.max(0, input.buyerFeeRate ?? 0);
  const marketplaceUsd = offerUsd + buyerFeesUsd;
  const savingsUsd = baselineUsd - marketplaceUsd;
  return {
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    baselineUsd,
    marketplaceUsd,
    buyerFeesUsd,
    savingsUsd,
    savingsPct: baselineUsd > 0 ? (savingsUsd / baselineUsd) * 100 : 0,
  };
}

/** Prices after applying a discount percentage to a baseline. */
export function applyDiscount(baseline: { inputPerM: number; outputPerM: number }, discountPct: number) {
  const f = 1 - Math.min(100, Math.max(0, discountPct)) / 100;
  return { inputPerM: baseline.inputPerM * f, outputPerM: baseline.outputPerM * f };
}
