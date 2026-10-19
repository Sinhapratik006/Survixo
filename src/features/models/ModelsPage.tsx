import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, LayoutGrid, RefreshCw, RotateCcw, Search, SearchX, Table2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNumber, formatRelative } from '@/lib/format';
import { useConfig } from '@/hooks/useConfig';
import { Alert, Button, DemoBadge, EmptyState, ErrorState, Input, Label, Modal, PageHeader, Select, Skeleton, Switch, useToast } from '@/components/ui';
import { ModelCard } from '@/components/marketplace/ModelCard';
import type { CatalogModel, ModelsResponse } from '@/types/api';
import {
  CAPABILITY_FILTERS,
  CONTEXT_OPTIONS,
  FILTER_PARAM_KEYS,
  MAX_COMPARE,
  SORT_OPTIONS,
  filterModels,
  hasActiveFilters,
  parseCompare,
  parseFilters,
  sortModels,
} from './filters';
import { useDocumentTitle, useNow } from './hooks';
import { useFavorites } from './useFavorites';
import { PriceExplainer } from './PriceExplainer';
import { ProviderFilter, type ProviderOption } from './ProviderFilter';
import { ModelsTable } from './ModelsTable';
import { CompareTray } from './CompareTray';
import { ComparePanel, SavedComparisonsList } from './ComparePanel';
import type { SavedComparison } from './useSavedComparisons';

const STALE_AFTER_MS = 2 * 60_000;
const SEARCH_DEBOUNCE_MS = 250;

interface ProvidersResponse {
  data: Array<{ id: string; name: string; website: string | null; dataPolicyUrl: string | null; modelCount: number }>;
}

function GridSkeleton() {
  return (
    <div role="status" aria-label="Loading models" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card space-y-4 p-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-14" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: 'grid' | 'table'; onChange: (v: 'grid' | 'table') => void }) {
  const item = (v: 'grid' | 'table', label: string, Icon: typeof LayoutGrid) => (
    <button
      type="button"
      aria-pressed={view === v}
      aria-label={label}
      title={label}
      onClick={() => onChange(v)}
      className={cn(
        'inline-flex h-8 w-9 items-center justify-center rounded-md transition-colors',
        view === v ? 'bg-white text-brand-700 shadow-sm ring-1 ring-cyan-400 dark:bg-navy-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
  return (
    <div role="group" aria-label="Layout" className="inline-flex gap-0.5 rounded-lg bg-brand-50 p-0.5 dark:bg-navy-800">
      {item('grid', 'Grid view', LayoutGrid)}
      {item('table', 'Table view', Table2)}
    </div>
  );
}

export default function ModelsPage() {
  useDocumentTitle('Model marketplace · Nexovra');
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const compare = useMemo(() => parseCompare(params), [params]);
  const view: 'grid' | 'table' = params.get('view') === 'table' ? 'table' : 'grid';
  const { data: config } = useConfig();
  const favorites = useFavorites();
  const toast = useToast();
  const now = useNow(15_000);
  const [compareOpen, setCompareOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  // Stable callbacks: Modal re-runs its focus effect whenever onClose changes identity.
  const closeCompare = useCallback(() => setCompareOpen(false), []);
  const closeSaved = useCallback(() => setSavedOpen(false), []);

  const query = useQuery({
    queryKey: ['models', 'marketplace'],
    queryFn: ({ signal }) => api.get<ModelsResponse>('/api/models', { signal, query: { sort: 'popularity' } }),
    refetchInterval: 60_000,
  });
  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: () => api.get<ProvidersResponse>('/api/providers'),
    staleTime: 5 * 60_000,
  });

  const update = useCallback(
    (changes: Record<string, string | null>, replace = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  // Search: local input state, debounced into the URL (`?q=`). External URL changes (reset, back) flow back in.
  const urlSearch = params.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(urlSearch);
  const pushedSearch = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch !== pushedSearch.current) {
      pushedSearch.current = urlSearch;
      setSearchInput(urlSearch);
    }
  }, [urlSearch]);
  useEffect(() => {
    if (searchInput === pushedSearch.current) return;
    const t = setTimeout(() => {
      pushedSearch.current = searchInput;
      update({ q: searchInput.trim() ? searchInput : null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, update]);

  const all = useMemo(() => query.data?.data ?? [], [query.data]);
  const catalog = useMemo(() => new Map(all.map((m) => [m.id, m])), [all]);
  const visible = useMemo(() => sortModels(filterModels(all, filters, favorites.ids), filters.sort), [all, filters, favorites.ids]);
  const compareModels = useMemo(() => compare.map((id) => catalog.get(id)).filter((m): m is CatalogModel => Boolean(m)), [compare, catalog]);

  const providerOptions = useMemo<ProviderOption[]>(() => {
    if (providersQuery.data?.data.length) return providersQuery.data.data.map((p) => ({ id: p.id, name: p.name, modelCount: p.modelCount }));
    const counts = new Map<string, ProviderOption>();
    for (const m of all) {
      const entry = counts.get(m.provider.id) ?? { id: m.provider.id, name: m.provider.name, modelCount: 0 };
      entry.modelCount = (entry.modelCount ?? 0) + 1;
      counts.set(m.provider.id, entry);
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [providersQuery.data, all]);

  const setCompare = (ids: string[]) => update({ compare: ids.length ? ids.join(',') : null });
  const toggleCompare = (id: string) => {
    if (compare.includes(id)) return setCompare(compare.filter((x) => x !== id));
    if (compare.length >= MAX_COMPARE) {
      toast.info(`You can compare up to ${MAX_COMPARE} models`, 'Remove one from the comparison tray first.');
      return;
    }
    setCompare([...compare, id]);
  };

  const toggleCapability = (token: string) => {
    const next = filters.capabilities.includes(token) ? filters.capabilities.filter((c) => c !== token) : [...filters.capabilities, token];
    update({ cap: next.length ? next.join(',') : null });
  };

  const resetFilters = () => {
    const changes: Record<string, null> = {};
    for (const k of FILTER_PARAM_KEYS) changes[k] = null;
    pushedSearch.current = '';
    setSearchInput('');
    update(changes, false);
  };

  const loadSaved = (c: SavedComparison) => {
    const known = c.modelIds.filter((id) => catalog.has(id)).slice(0, MAX_COMPARE);
    if (known.length < c.modelIds.length) toast.info('Some models are no longer in the catalog', 'They were left out of the comparison.');
    setCompare(known);
    setSavedOpen(false);
    if (known.length >= 2) setCompareOpen(true);
  };

  const data = query.data;
  const stale = Boolean(data) && (query.isError || now - query.dataUpdatedAt > STALE_AFTER_MS);
  const filtersActive = hasActiveFilters(filters);

  return (
    <div className={cn('container-page py-8 sm:py-10', compare.length > 0 && 'pb-32 sm:pb-28')}>
      <PageHeader
        title="Model marketplace"
        badge={data?.notes.demo ? <DemoBadge /> : undefined}
        description={
          data ? (
            <>
              <span className="num">{formatNumber(data.total)}</span> models in the catalog · Updated <time dateTime={data.generatedAt}>{formatRelative(data.generatedAt)}</time>
              {query.isFetching && !query.isLoading && <span className="ml-1">· refreshing…</span>}
            </>
          ) : (
            'Compare models, baseline prices and validated seller offers. Call any of them through one OpenAI-compatible API.'
          )
        }
        actions={
          <>
            {favorites.signedIn && (
              <Button variant="outline" size="sm" leftIcon={<Bookmark className="h-4 w-4" aria-hidden />} onClick={() => setSavedOpen(true)}>
                Saved comparisons
              </Button>
            )}
            <ViewToggle view={view} onChange={(v) => update({ view: v === 'table' ? 'table' : null })} />
          </>
        }
      />
      <div className="space-y-3">
        {data?.notes.demo && (
          <Alert tone="demo" title="Demo data">
            {data.notes.demo}
          </Alert>
        )}
        {stale && (
          <Alert tone="warning" title="Prices may be out of date">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {query.isError ? 'The latest refresh failed. ' : ''}
                Showing data from {formatRelative(new Date(query.dataUpdatedAt))}. Offer prices and availability can change at any time.
              </span>
              <Button size="sm" variant="outline" loading={query.isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />} onClick={() => query.refetch()}>
                Refresh now
              </Button>
            </div>
          </Alert>
        )}
        <PriceExplainer demoMode={Boolean(data?.notes.demo ?? config?.demoMode)} />
      </div>

      <section aria-label="Filters" className="card mt-6 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div>
            <Label htmlFor="models-search">Search models</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input id="models-search" type="search" placeholder="Model name, ID or provider" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" autoComplete="off" />
            </div>
          </div>
          <ProviderFilter options={providerOptions} value={filters.providers} onChange={(ids) => update({ provider: ids.length ? ids.join(',') : null })} />
          <div>
            <Label htmlFor="models-max-price">Max output $/1M</Label>
            <Input
              id="models-max-price"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              placeholder="Any"
              value={params.get('maxPrice') ?? ''}
              onChange={(e) => update({ maxPrice: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="models-context">Min context</Label>
            <Select id="models-context" value={params.get('minContext') ?? ''} onChange={(e) => update({ minContext: e.target.value || null })}>
              {CONTEXT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="models-sort">Sort by</Label>
            <Select id="models-sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value === 'popularity' ? null : e.target.value })}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-4" role="group" aria-label="Capabilities">
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200" aria-hidden>
            Capabilities
          </p>
          <div className="flex flex-wrap gap-2">
            {CAPABILITY_FILTERS.map((c) => {
              const active = filters.capabilities.includes(c.token);
              return (
                <button
                  key={c.token}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleCapability(c.token)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors',
                    active
                      ? 'bg-cyan-50 text-cyan-900 ring-cyan-400 dark:bg-cyan-950/50 dark:text-cyan-100 dark:ring-cyan-600'
                      : 'bg-white text-slate-600 ring-brand-100 hover:bg-brand-50 hover:text-slate-900 dark:bg-navy-900 dark:text-slate-300 dark:ring-navy-500 dark:hover:bg-navy-700',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-brand-50 pt-4 dark:border-navy-700">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={filters.available} onChange={(v) => update({ available: v ? '1' : null })} label="Only available" />
              <span className="text-sm text-slate-700 dark:text-slate-200" aria-hidden>
                Only available
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={filters.favoritesOnly} onChange={(v) => update({ favorites: v ? '1' : null })} label="Favorites only" />
              <span className="text-sm text-slate-700 dark:text-slate-200" aria-hidden>
                Favorites only <span className="num text-muted">({favorites.ids.size})</span>
              </span>
            </div>
            {!favorites.signedIn && !favorites.sessionLoading && (
              <p className="text-xs text-muted">
                Favorites are stored in this browser.{' '}
                <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                  Sign in
                </Link>{' '}
                to sync them to your account.
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!filtersActive && filters.sort === 'popularity'} leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}>
            Reset filters
          </Button>
        </div>
      </section>

      <div className="mt-6">
        {query.isLoading ? (
          <GridSkeleton />
        ) : !data ? (
          <div className="card">
            <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load models" />
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted" aria-live="polite">
              Showing <span className="num font-medium text-slate-900 dark:text-white">{visible.length}</span> of <span className="num">{all.length}</span> models
            </p>
            {visible.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={<SearchX className="h-5 w-5" aria-hidden />}
                  title="No models match these filters"
                  description={filters.favoritesOnly && favorites.ids.size === 0 ? 'You have no favorite models yet. Use the heart icon on a model to add one.' : 'Try removing a filter or broadening your search.'}
                  action={
                    <Button variant="outline" size="sm" onClick={resetFilters} leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}>
                      Reset filters
                    </Button>
                  }
                />
              </div>
            ) : view === 'table' ? (
              <ModelsTable
                models={visible}
                favorites={favorites.ids}
                onToggleFavorite={favorites.toggle}
                compare={compare}
                onToggleCompare={toggleCompare}
                compareFull={compare.length >= MAX_COMPARE}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    favorite={favorites.ids.has(m.id)}
                    onToggleFavorite={() => favorites.toggle(m.id)}
                    compareSelected={compare.includes(m.id)}
                    onToggleCompare={() => toggleCompare(m.id)}
                    compareDisabled={compare.length >= MAX_COMPARE}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <CompareTray ids={compare} catalog={catalog} onRemove={(id) => setCompare(compare.filter((x) => x !== id))} onClear={() => setCompare([])} onCompare={() => setCompareOpen(true)} />

      <ComparePanel open={compareOpen} onClose={closeCompare} models={compareModels} signedIn={favorites.signedIn} catalog={catalog} onLoad={loadSaved} />

      {favorites.signedIn && (
        <Modal open={savedOpen} onClose={closeSaved} title="Saved comparisons" description="Load a saved set of models into the comparison tray.">
          <SavedComparisonsList catalog={catalog} onLoad={loadSaved} />
        </Modal>
      )}
    </div>
  );
}
