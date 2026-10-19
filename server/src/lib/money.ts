export const MICROS_PER_USD = 1_000_000n;

export function usdToMicros(usd: number): bigint {
  if (!Number.isFinite(usd)) throw new Error('Invalid USD amount');
  return BigInt(Math.round(usd * 1_000_000));
}

export function microsToUsd(micros: bigint | number | null | undefined): number {
  if (micros === null || micros === undefined) return 0;
  return Number(micros) / 1_000_000;
}

export function nullableMicrosToUsd(micros: bigint | null | undefined): number | null {
  return micros === null || micros === undefined ? null : Number(micros) / 1_000_000;
}

/** Price stored as micro-USD per 1M tokens -> USD per 1M tokens. */
export function pricePerMToUsd(price: number | null | undefined): number | null {
  return price === null || price === undefined ? null : price / 1_000_000;
}

export function usdPerMToPrice(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/**
 * Exact token cost in micro-USD, rounded up so fractional micros are never lost.
 * cost = inputTokens/1e6 * inputPrice + outputTokens/1e6 * outputPrice
 * where prices are micro-USD per 1M tokens.
 */
export function tokenCostMicros(
  inputTokens: number,
  outputTokens: number,
  inputPricePerM: number,
  outputPricePerM: number,
): bigint {
  const numerator =
    BigInt(Math.max(0, Math.trunc(inputTokens))) * BigInt(inputPricePerM) +
    BigInt(Math.max(0, Math.trunc(outputTokens))) * BigInt(outputPricePerM);
  const million = 1_000_000n;
  return (numerator + million - 1n) / million;
}

export function feeSplit(costMicros: bigint, feeBps: number): { fee: bigint; seller: bigint } {
  const fee = (costMicros * BigInt(feeBps)) / 10_000n;
  return { fee, seller: costMicros - fee };
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
