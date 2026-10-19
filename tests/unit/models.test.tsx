import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, createQueryClient } from '@/app/providers';
import ModelsPage from '@/features/models/ModelsPage';
import { filterModels, parseCompare, parseFilters, sortModels } from '@/features/models/filters';
import type { CatalogModel, ModelsResponse, PublicConfig } from '@/types/api';

function model(partial: Partial<CatalogModel> & Pick<CatalogModel, 'id' | 'name'>): CatalogModel {
  return {
    provider: { id: 'acme', name: 'Acme AI' },
    description: null,
    family: null,
    contextWindow: 32_768,
    maxOutputTokens: 4096,
    inputModalities: ['text'],
    outputModalities: ['text'],
    capabilities: [{ capability: 'chat', status: 'declared', source: null }],
    apiSupported: true,
    isDemo: false,
    aliases: [],
    baseline: { inputPerM: 1, outputPerM: 3, source: null, isDemo: false },
    bestOffer: null,
    offerCount: 0,
    healthyOfferCount: 0,
    requests7d: 0,
    qualityScore: null,
    p50LatencyMs: null,
    successRate: null,
    ...partial,
  };
}

const offer = (inputPerM: number, outputPerM: number): NonNullable<CatalogModel['bestOffer']> => ({
  offerId: `off_${inputPerM}`,
  sellerName: 'Seller One',
  inputPerM,
  outputPerM,
  discountPct: 40,
  p50LatencyMs: 420,
  reliabilityScore: null,
  healthStatus: 'HEALTHY',
  isDemo: false,
});

const MODELS: CatalogModel[] = [
  model({
    id: 'acme/alpha-chat',
    name: 'Alpha Chat',
    capabilities: [
      { capability: 'chat', status: 'verified', source: null },
      { capability: 'tools', status: 'declared', source: null },
    ],
    bestOffer: offer(0.6, 1.8),
    offerCount: 2,
    healthyOfferCount: 2,
    requests7d: 500,
    contextWindow: 128_000,
  }),
  model({
    id: 'acme/beta-vision',
    name: 'Beta Vision',
    inputModalities: ['text', 'image'],
    capabilities: [
      { capability: 'chat', status: 'declared', source: null },
      { capability: 'vision', status: 'declared', source: null },
    ],
    bestOffer: offer(0.2, 0.8),
    offerCount: 1,
    healthyOfferCount: 1,
    requests7d: 300,
  }),
  model({
    id: 'nova/gamma-embed',
    name: 'Gamma Embed',
    provider: { id: 'nova', name: 'Nova Labs' },
    outputModalities: ['embedding'],
    capabilities: [{ capability: 'embeddings', status: 'declared', source: null }],
    requests7d: 200,
    contextWindow: 8192,
  }),
  model({
    id: 'nova/delta-image',
    name: 'Delta Image',
    provider: { id: 'nova', name: 'Nova Labs' },
    outputModalities: ['image'],
    capabilities: [{ capability: 'image_generation', status: 'declared', source: null }],
    apiSupported: false,
    baseline: null,
    requests7d: 100,
  }),
  model({
    id: 'acme/epsilon-coder',
    name: 'Epsilon Coder',
    capabilities: [
      { capability: 'chat', status: 'declared', source: null },
      { capability: 'json_mode', status: 'declared', source: null },
    ],
    requests7d: 50,
  }),
];

const MODELS_RESPONSE: ModelsResponse = {
  data: MODELS,
  total: MODELS.length,
  generatedAt: new Date().toISOString(),
  notes: { blendedPrice: 'Comparisons use a blended price assuming 3 input tokens per output token.', demo: null },
};

const CONFIG: PublicConfig = {
  demoMode: false,
  billingMode: 'demo',
  platformFeeBps: 1000,
  googleAuthEnabled: false,
  apiBaseUrl: 'http://localhost:8787/v1',
  adapters: [],
  reliability: { minSamples: 30, windowDays: 7 },
};

const PROVIDERS = {
  data: [
    { id: 'acme', name: 'Acme AI', website: null, dataPolicyUrl: null, modelCount: 3 },
    { id: 'nova', name: 'Nova Labs', website: null, dataPolicyUrl: null, modelCount: 2 },
  ],
};

function json(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.startsWith('/api/models')) return json(MODELS_RESPONSE);
  if (url.startsWith('/api/providers')) return json(PROVIDERS);
  if (url.startsWith('/api/config/public')) return json(CONFIG);
  if (url.startsWith('/api/auth/me')) return json({ user: null, memberships: [] });
  return json({ error: { code: 'not_found', message: `Unexpected request: ${url}` } }, 404);
});

function renderPage(path = '/models') {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <ModelsPage />
      </MemoryRouter>
    </AppProviders>,
  );
}

const cardHeading = (name: string) => screen.queryByRole('heading', { name, level: 3 });

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelsPage', () => {
  it('renders the catalog with a count and sets the document title', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Alpha Chat', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Model marketplace' })).toBeInTheDocument();
    expect(cardHeading('Epsilon Coder')).toBeInTheDocument();
    expect(screen.getByText(/models in the catalog/)).toBeInTheDocument();
    expect(document.title).toContain('Model marketplace');
  });

  it('filters by search term (debounced)', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Alpha Chat', level: 3 });

    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'beta' } });

    await waitFor(() => expect(cardHeading('Alpha Chat')).not.toBeInTheDocument());
    expect(cardHeading('Beta Vision')).toBeInTheDocument();
    expect(cardHeading('Gamma Embed')).not.toBeInTheDocument();

    // Provider names are searchable too.
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'nova labs' } });
    await waitFor(() => expect(cardHeading('Gamma Embed')).toBeInTheDocument());
    expect(cardHeading('Delta Image')).toBeInTheDocument();
    expect(cardHeading('Beta Vision')).not.toBeInTheDocument();
  });

  it('filters by capability chips and shows an empty state with reset', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Alpha Chat', level: 3 });

    const vision = screen.getByRole('button', { name: 'Vision' });
    expect(vision).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(vision);
    expect(screen.getByRole('button', { name: 'Vision' })).toHaveAttribute('aria-pressed', 'true');
    expect(cardHeading('Beta Vision')).toBeInTheDocument();
    expect(cardHeading('Alpha Chat')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vision' }));
    fireEvent.click(screen.getByRole('button', { name: 'Image generation' }));
    expect(cardHeading('Delta Image')).toBeInTheDocument();
    expect(cardHeading('Beta Vision')).not.toBeInTheDocument();

    // Combined chips are AND-ed: no model generates images and embeddings.
    fireEvent.click(screen.getByRole('button', { name: 'Embeddings' }));
    expect(screen.getByText('No models match these filters')).toBeInTheDocument();

    const emptyState = screen.getByText('No models match these filters').parentElement!;
    fireEvent.click(within(emptyState).getByRole('button', { name: /reset filters/i }));
    expect(cardHeading('Alpha Chat')).toBeInTheDocument();
    expect(cardHeading('Delta Image')).toBeInTheDocument();
  });

  it('limits the comparison to four models', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Alpha Chat', level: 3 });

    for (const name of ['Alpha Chat', 'Beta Vision', 'Gamma Embed', 'Delta Image']) {
      fireEvent.click(screen.getByRole('button', { name: `Add ${name} to comparison` }));
    }

    const tray = screen.getByRole('region', { name: 'Comparison tray' });
    expect(within(tray).getByText('4/4 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Epsilon Coder to comparison' })).toBeDisabled();

    // Removing one frees a slot again.
    fireEvent.click(within(tray).getByRole('button', { name: 'Remove Alpha Chat from comparison' }));
    expect(within(tray).getByText('3/4 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Epsilon Coder to comparison' })).toBeEnabled();
  });

  it('restores the comparison from the URL, capped at four', async () => {
    renderPage('/models?compare=acme/alpha-chat,acme/beta-vision,nova/gamma-embed,nova/delta-image,acme/epsilon-coder');
    await screen.findByRole('heading', { name: 'Alpha Chat', level: 3 });
    const tray = screen.getByRole('region', { name: 'Comparison tray' });
    expect(within(tray).getByText('4/4 selected')).toBeInTheDocument();
    expect(within(tray).queryByText('Epsilon Coder')).not.toBeInTheDocument();
  });

  it('opens the comparison panel with the selected models', async () => {
    renderPage('/models?compare=acme/alpha-chat,acme/beta-vision');
    await screen.findByRole('heading', { name: 'Alpha Chat', level: 3 });
    fireEvent.click(within(screen.getByRole('region', { name: 'Comparison tray' })).getByRole('button', { name: /^compare/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Estimated monthly cost')).toBeInTheDocument();
    // 100M tokens at 75% input on Beta Vision's offer: 75 × $0.20 + 25 × $0.80 = $35.00
    expect(within(dialog).getByText('$35.00')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Insufficient data').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Not measured').length).toBeGreaterThan(0);
  });
});

describe('model filter helpers', () => {
  it('parses URL params with safe defaults', () => {
    const f = parseFilters(new URLSearchParams('q=chat&cap=vision,tools&maxPrice=abc&minContext=32000&available=1&sort=bogus'));
    expect(f).toMatchObject({ search: 'chat', capabilities: ['vision', 'tools'], maxPrice: null, minContext: 32000, available: true, sort: 'popularity' });
    expect(parseCompare(new URLSearchParams('compare=a,b,a,c,d,e'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('applies price, context, availability and provider filters like the API', () => {
    const base = parseFilters(new URLSearchParams());
    const names = (list: CatalogModel[]) => list.map((m) => m.name);
    expect(names(filterModels(MODELS, { ...base, maxPrice: 1 }))).toEqual(['Beta Vision']);
    expect(names(filterModels(MODELS, { ...base, minContext: 100_000 }))).toEqual(['Alpha Chat']);
    expect(names(filterModels(MODELS, { ...base, available: true }))).toEqual(['Alpha Chat', 'Beta Vision']);
    expect(names(filterModels(MODELS, { ...base, providers: ['NOVA'] }))).toEqual(['Gamma Embed', 'Delta Image']);
    expect(names(filterModels(MODELS, { ...base, favoritesOnly: true }, new Set(['acme/epsilon-coder'])))).toEqual(['Epsilon Coder']);
  });

  it('sorts by price with models without offers last', () => {
    expect(sortModels(MODELS, 'price').map((m) => m.name)).toEqual(['Beta Vision', 'Alpha Chat', 'Delta Image', 'Epsilon Coder', 'Gamma Embed']);
    expect(sortModels(MODELS, 'context')[0]!.name).toBe('Alpha Chat');
  });
});
