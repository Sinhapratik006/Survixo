import type { CatalogModel } from '@/types/api';

/** Blended price assumption shared with the API: 3 input tokens per output token. */
export const BLEND_INPUT_SHARE = 0.75;
export const MAX_COMPARE = 4;

export function blendedPrice(inputPerM: number, outputPerM: number): number {
  return inputPerM * BLEND_INPUT_SHARE + outputPerM * (1 - BLEND_INPUT_SHARE);
}

/** Discount of an offer vs. the baseline on the blended price, in percent (null without a baseline). */
export function blendedDiscountPct(offer: { inputPerM: number; outputPerM: number }, baseline: { inputPerM: number; outputPerM: number } | null): number | null {
  if (!baseline) return null;
  const base = blendedPrice(baseline.inputPerM, baseline.outputPerM);
  if (base <= 0) return null;
  return (1 - blendedPrice(offer.inputPerM, offer.outputPerM) / base) * 100;
}

/** Capability filter chips. Tokens match the API `capability` filter (capability names or modality filters). */
export const CAPABILITY_FILTERS = [
  { token: 'chat', label: 'Text' },
  { token: 'vision', label: 'Vision' },
  { token: 'output:image', label: 'Image generation' },
  { token: 'output:audio', label: 'Audio' },
  { token: 'output:video', label: 'Video' },
  { token: 'output:embedding', label: 'Embeddings' },
  { token: 'tools', label: 'Tools' },
  { token: 'json_mode', label: 'JSON mode' },
] as const;

export const SORT_OPTIONS = [
  { value: 'popularity', label: 'Most popular' },
  { value: 'price', label: 'Lowest price' },
  { value: 'latency', label: 'Lowest latency' },
  { value: 'quality', label: 'Measured quality' },
  { value: 'context', label: 'Largest context' },
  { value: 'discount', label: 'Biggest discount' },
  { value: 'name', label: 'Name (A–Z)' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['value'];

export const CONTEXT_OPTIONS = [
  { value: '', label: 'Any context' },
  { value: '8000', label: '8K+' },
  { value: '32000', label: '32K+' },
  { value: '128000', label: '128K+' },
] as const;

export interface ModelFilters {
  search: string;
  capabilities: string[];
  providers: string[];
  maxPrice: number | null;
  minContext: number | null;
  available: boolean;
  favoritesOnly: boolean;
  sort: SortKey;
}

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((s) => s.value));

function list(value: string | null): string[] {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function positiveNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** URL search params → filter state. Unknown or malformed values fall back to defaults. */
export function parseFilters(params: URLSearchParams): ModelFilters {
  const sort = params.get('sort') ?? 'popularity';
  return {
    search: params.get('q') ?? '',
    capabilities: list(params.get('cap')),
    providers: list(params.get('provider')),
    maxPrice: positiveNumber(params.get('maxPrice')),
    minContext: positiveNumber(params.get('minContext')),
    available: params.get('available') === '1',
    favoritesOnly: params.get('favorites') === '1',
    sort: (SORT_VALUES.has(sort) ? sort : 'popularity') as SortKey,
  };
}

export function parseCompare(params: URLSearchParams): string[] {
  return [...new Set(list(params.get('compare')))].slice(0, MAX_COMPARE);
}

/** Query params that make up the filter view (used for "reset filters"). */
export const FILTER_PARAM_KEYS = ['q', 'cap', 'provider', 'maxPrice', 'minContext', 'available', 'favorites', 'sort'] as const;

export function hasActiveFilters(f: ModelFilters): boolean {
  return Boolean(f.search.trim() || f.capabilities.length || f.providers.length || f.maxPrice !== null || f.minContext !== null || f.available || f.favoritesOnly);
}

function modelTokens(m: CatalogModel): Set<string> {
  return new Set([...m.capabilities.map((c) => c.capability), ...m.outputModalities.map((o) => `output:${o}`), ...m.inputModalities.map((i) => `input:${i}`)]);
}

/** Mirrors the API filter semantics of GET /api/models so filtering stays instant client-side. */
export function filterModels(models: CatalogModel[], f: ModelFilters, favorites: ReadonlySet<string> = new Set()): CatalogModel[] {
  const term = f.search.trim().toLowerCase();
  const providers = f.providers.map((p) => p.toLowerCase());
  return models.filter((m) => {
    if (term && !`${m.name} ${m.id} ${m.provider.name} ${m.aliases.join(' ')}`.toLowerCase().includes(term)) return false;
    if (f.capabilities.length) {
      const tokens = modelTokens(m);
      if (!f.capabilities.every((c) => tokens.has(c))) return false;
    }
    if (providers.length && !providers.includes(m.provider.id.toLowerCase())) return false;
    if (f.maxPrice !== null && (!m.bestOffer || m.bestOffer.outputPerM > f.maxPrice)) return false;
    if (f.minContext !== null && (m.contextWindow ?? 0) < f.minContext) return false;
    if (f.available && !m.healthyOfferCount) return false;
    if (f.favoritesOnly && !favorites.has(m.id)) return false;
    return true;
  });
}

export function sortModels(models: CatalogModel[], sort: SortKey): CatalogModel[] {
  const price = (m: CatalogModel) => (m.bestOffer ? blendedPrice(m.bestOffer.inputPerM, m.bestOffer.outputPerM) : Number.POSITIVE_INFINITY);
  const nullsLast = (v: number | null | undefined, dir: 1 | -1) => (v === null || v === undefined ? Number.POSITIVE_INFINITY : dir * v);
  const cmp: Record<SortKey, (a: CatalogModel, b: CatalogModel) => number> = {
    price: (a, b) => price(a) - price(b),
    latency: (a, b) => nullsLast(a.p50LatencyMs, 1) - nullsLast(b.p50LatencyMs, 1),
    popularity: (a, b) => b.requests7d - a.requests7d || b.offerCount - a.offerCount,
    quality: (a, b) => nullsLast(a.qualityScore, -1) - nullsLast(b.qualityScore, -1),
    context: (a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0),
    discount: (a, b) => nullsLast(a.bestOffer?.discountPct, -1) - nullsLast(b.bestOffer?.discountPct, -1),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...models].sort((a, b) => {
    const d = cmp[sort](a, b);
    // Infinity - Infinity is NaN: treat equal "missing" values as ties.
    return (Number.isNaN(d) ? 0 : d) || a.name.localeCompare(b.name);
  });
}

export function isDemoModel(m: CatalogModel): boolean {
  return Boolean(m.isDemo || m.bestOffer?.isDemo || m.baseline?.isDemo);
}
