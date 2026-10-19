import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '@/components/ui';
import { ChatTab } from './ChatTab';
import { ArenaTab } from './ArenaTab';
import { MatchTab } from './MatchTab';
import { BenchmarksTab } from './BenchmarksTab';
import { OptimizerTab } from './OptimizerTab';
import { useDocumentTitle } from './shared';

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'arena', label: 'Arena' },
  { id: 'match', label: 'Model match' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'optimizer', label: 'Cost optimizer' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const DESCRIPTIONS: Record<TabId, string> = {
  chat: 'Interactive model testing through the real routing pipeline. Requests are billed and traced like API calls.',
  arena: 'Compare 2–4 models side by side on the same prompt and record your ratings.',
  match: 'Describe a task and get transparent, rule-based model recommendations.',
  benchmarks: 'Published benchmark results with their method and limitations, plus private runs.',
  optimizer: 'Spend analysis and cost-saving recommendations. Nothing changes until you approve it.',
};

export default function PlaygroundPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'chat';
  const tabLabel = TABS.find((t) => t.id === tab)!.label;
  useDocumentTitle(`Playground · ${tabLabel} · Nexovra`);

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setParams(next, { replace: true });
  };

  const modelsParam = params.get('models') ?? '';

  return (
    <div>
      <PageHeader title="Playground" description={DESCRIPTIONS[tab]} />
      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} className="mb-6" />
      <div role="tabpanel" aria-label={tabLabel}>
        {tab === 'chat' && <ChatTab initialModel={params.get('model')} />}
        {tab === 'arena' && <ArenaTab key={modelsParam} initialModels={modelsParam.split(',').map((s) => s.trim()).filter(Boolean)} />}
        {tab === 'match' && (
          <MatchTab
            onCompare={(ids) => {
              const next = new URLSearchParams(params);
              next.set('tab', 'arena');
              next.set('models', ids.join(','));
              setParams(next);
            }}
          />
        )}
        {tab === 'benchmarks' && <BenchmarksTab />}
        {tab === 'optimizer' && <OptimizerTab onGoToChat={() => setTab('chat')} />}
      </div>
    </div>
  );
}
