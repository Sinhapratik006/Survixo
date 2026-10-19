/** Currency with adaptive precision: tiny per-request costs keep significant digits. */
export function formatUsd(value: number | null | undefined, opts: { precise?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  let digits = 2;
  if (opts.precise || (abs > 0 && abs < 0.01)) digits = abs >= 1 ? 4 : abs >= 0.01 ? 4 : 6;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** USD per 1M tokens. */
export function formatPricePerM(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const digits = value >= 1 ? 2 : value >= 0.1 ? 3 : 4;
  return `$${value.toFixed(digits)}`;
}

export function formatNumber(value: number | null | undefined, opts: Intl.NumberFormatOptions = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', opts);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Fraction (0..1) as percent. */
export function formatRatio(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', opts);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];
  for (const [unit, ms] of units) if (abs >= ms || unit === 'second') return rtf.format(-Math.round(diff / ms), unit);
  return '';
}

/** Short day label for chart axes (YYYY-MM-DD → "Oct 19"). */
export function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
