import { describe, expect, it } from 'vitest';
import { formatMs, formatPricePerM, formatRatio, formatTokens, formatUsd } from '@/lib/format';
import { cn } from '@/lib/cn';

describe('formatting helpers', () => {
  it('keeps significant digits for tiny per-request costs', () => {
    expect(formatUsd(12.5)).toBe('$12.50');
    expect(formatUsd(0.000123)).toBe('$0.000123');
    expect(formatUsd(null)).toBe('—');
  });

  it('formats prices, tokens, ratios and latency', () => {
    expect(formatPricePerM(0.18)).toBe('$0.180');
    expect(formatPricePerM(2)).toBe('$2.00');
    expect(formatTokens(131072)).toBe('131K');
    expect(formatTokens(2_000_000)).toBe('2M');
    expect(formatRatio(0.987)).toBe('98.7%');
    expect(formatMs(250)).toBe('250 ms');
    expect(formatMs(1500)).toBe('1.50 s');
  });

  it('combines class names', () => {
    expect(cn('a', false, null, ['b', { c: true, d: false }])).toBe('a b c');
  });
});
