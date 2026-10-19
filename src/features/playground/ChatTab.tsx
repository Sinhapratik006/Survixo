import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bot, ExternalLink, Send, Square, Trash2, User } from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, DemoBadge, EmptyState, ErrorState, Field, Input, LoadingBlock, Select, Switch, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMs, formatNumber, formatUsd } from '@/lib/format';
import { streamPlaygroundChat, type StreamMeta } from '@/services/stream';
import { useCan } from '@/features/auth/useSession';
import type { ChatCompletionResponse } from '@/types/api';
import { CAPABILITIES, InferenceErrorNotice, errorInfo, isAvailable, modelLabel, parseOptionalNumber, useApiModels, type CapabilityId } from './shared';
import type { TokenUsage } from './types';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  meta?: StreamMeta;
  usage?: TokenUsage;
  error?: { message: string; code?: string; requestId?: string };
  pending?: boolean;
  stopped?: boolean;
}

const ROUTING_MODES = [
  { id: '', label: 'Policy default' },
  { id: 'LOWEST_COST', label: 'Lowest cost' },
  { id: 'BALANCED', label: 'Balanced' },
  { id: 'QUALITY_FIRST', label: 'Quality first' },
];

let nextId = 1;

export function ChatTab({ initialModel }: { initialModel: string | null }) {
  const canInfer = useCan('inference:use');
  const models = useApiModels();
  const [model, setModel] = useState(initialModel ?? '');
  const [system, setSystem] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [maxTokens, setMaxTokens] = useState('512');
  const [temperature, setTemperature] = useState('0.7');
  const [routingMode, setRoutingMode] = useState('');
  const [stream, setStream] = useState(true);
  const [agentMode, setAgentMode] = useState(false);
  const [maxCost, setMaxCost] = useState('');
  const [minDiscount, setMinDiscount] = useState('');
  const [maxLatency, setMaxLatency] = useState('');
  const [caps, setCaps] = useState<CapabilityId[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Resolve `?model=` (id or alias) once the catalog loads; otherwise preselect the first available model.
  useEffect(() => {
    const list = models.data;
    if (!list?.length || list.some((m) => m.id === model)) return;
    const wanted = model.toLowerCase();
    const match = wanted ? list.find((m) => m.id.toLowerCase() === wanted || m.aliases.includes(wanted)) : undefined;
    const next = match ?? list.find(isAvailable) ?? list[0];
    if (next) setModel(next.id);
  }, [model, models.data]);

  const selected = models.data?.find((m) => m.id === model);

  const maxTokensN = Number(maxTokens);
  const temperatureN = Number(temperature);
  const maxCostN = parseOptionalNumber(maxCost);
  const minDiscountN = parseOptionalNumber(minDiscount);
  const maxLatencyN = parseOptionalNumber(maxLatency);
  const errors = {
    maxTokens: !Number.isInteger(maxTokensN) || maxTokensN < 1 || maxTokensN > 32_768 ? 'Whole number between 1 and 32,768' : undefined,
    temperature: !Number.isFinite(temperatureN) || temperatureN < 0 || temperatureN > 2 ? 'Between 0 and 2' : undefined,
    maxCost: agentMode && maxCostN !== undefined && (Number.isNaN(maxCostN) || maxCostN <= 0 || maxCostN > 10_000) ? 'Greater than 0, at most 10,000' : undefined,
    minDiscount: agentMode && minDiscountN !== undefined && (Number.isNaN(minDiscountN) || minDiscountN < 0 || minDiscountN > 100) ? 'Between 0 and 100' : undefined,
    maxLatency:
      agentMode && maxLatencyN !== undefined && (Number.isNaN(maxLatencyN) || !Number.isInteger(maxLatencyN) || maxLatencyN <= 0 || maxLatencyN > 600_000)
        ? 'Whole milliseconds, at most 600,000'
        : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const update = (id: number, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !model || busy || hasErrors || !canInfer) return;

    const history = messages.filter((m) => !m.error && !m.pending && m.content).map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMessage = { id: nextId++, role: 'user', content: text };
    const assistant: ChatMessage = { id: nextId++, role: 'assistant', content: '', model, pending: true };
    setMessages((list) => [...list, userMsg, assistant]);
    setInput('');

    const nexovra: Record<string, unknown> = {};
    if (routingMode) nexovra.routing_mode = routingMode;
    if (agentMode) {
      if (maxCostN !== undefined) nexovra.max_cost_usd = maxCostN;
      if (minDiscountN !== undefined) nexovra.min_discount_pct = minDiscountN;
      if (maxLatencyN !== undefined) nexovra.max_latency_ms = maxLatencyN;
      if (caps.length) nexovra.required_capabilities = caps;
    }
    const body: Record<string, unknown> = {
      model,
      messages: [...(system.trim() ? [{ role: 'system', content: system.trim() }] : []), ...history, { role: 'user', content: text }],
      max_tokens: maxTokensN,
      temperature: temperatureN,
      ...(Object.keys(nexovra).length ? { nexovra } : {}),
    };

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      if (stream) {
        await streamPlaygroundChat(
          body,
          {
            onDelta: (t) => update(assistant.id, (m) => ({ content: m.content + t })),
            onDone: ({ usage, meta }) => update(assistant.id, { usage, meta }),
            onError: (message, code) => update(assistant.id, { error: { message, code } }),
          },
          controller.signal,
        );
      } else {
        const res = await api.post<ChatCompletionResponse>('/api/playground/chat', body, { signal: controller.signal });
        update(assistant.id, { content: res.choices[0]?.message.content ?? '', usage: res.usage, meta: res.nexovra });
      }
    } catch (err) {
      if (controller.signal.aborted) update(assistant.id, { stopped: true });
      else update(assistant.id, { error: errorInfo(err) });
    } finally {
      update(assistant.id, { pending: false });
      abortRef.current = null;
      setBusy(false);
    }
  };

  const stop = () => abortRef.current?.abort();
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  if (models.isLoading) return <LoadingBlock rows={5} />;
  if (models.error) return <ErrorState error={models.error} onRetry={() => models.refetch()} />;
  if (!models.data?.length)
    return <EmptyState title="No models available" description="No catalog model is available through the chat API yet." action={<Link to="/models" className="text-sm font-medium text-brand-600 underline">Browse the marketplace</Link>} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex min-h-[560px] flex-col">
        <CardHeader
          title="Conversation"
          description={selected ? `${selected.name} · ${selected.provider.name}` : 'Choose a model to start'}
          actions={
            <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} disabled={!messages.length || busy} onClick={() => setMessages([])}>
              Clear
            </Button>
          }
        />
        <div ref={scrollRef} className="max-h-[560px] flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite" aria-busy={busy}>
          {!messages.length ? (
            <EmptyState
              icon={<Bot className="h-5 w-5" aria-hidden />}
              title="Send a message to test this model"
              description="Requests go through the same routing, billing and tracing as the public API and are billed to your organization balance."
            />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>
        <form onSubmit={send} className="border-t border-brand-50 p-4 dark:border-navy-700">
          {!canInfer && (
            <Alert tone="warning" className="mb-3">
              Your role in this organization cannot run inference (requires the <code>inference:use</code> permission).
            </Alert>
          )}
          {selected && !isAvailable(selected) && (
            <Alert tone="warning" className="mb-3">
              {selected.name} has no healthy offers right now; requests will likely fail with <code>no_eligible_offer</code>.
            </Alert>
          )}
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <Textarea id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Ask something… (Ctrl/⌘ + Enter to send)" rows={3} disabled={!canInfer} maxLength={100_000} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">Demo endpoints return synthetic text, not real model output.</p>
            {busy ? (
              <Button variant="outline" onClick={stop} leftIcon={<Square className="h-3.5 w-3.5" />}>
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim() || !model || hasErrors || !canInfer} leftIcon={<Send className="h-4 w-4" />}>
                Send
              </Button>
            )}
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Model & parameters" />
          <CardBody className="space-y-4">
            <Field label="Model" hint={selected && !isAvailable(selected) ? 'No healthy offers right now' : undefined}>
              {(id, aria) => (
                <Select id={id} {...aria} value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
                  {models.data.map((m) => (
                    <option key={m.id} value={m.id}>
                      {modelLabel(m)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="System prompt" hint="Optional. Sent as the first message of every turn.">
              {(id, aria) => <Textarea id={id} {...aria} value={system} onChange={(e) => setSystem(e.target.value)} rows={3} maxLength={8000} placeholder="You are a concise assistant." />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max tokens" error={errors.maxTokens}>
                {(id, aria) => <Input id={id} {...aria} type="number" min={1} max={32768} inputMode="numeric" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="num" />}
              </Field>
              <Field label="Temperature" error={errors.temperature}>
                {(id, aria) => <Input id={id} {...aria} type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(e.target.value)} className="num" />}
              </Field>
            </div>
            <Field label="Routing mode" hint="Overrides your default routing policy's mode for these requests.">
              {(id, aria) => (
                <Select id={id} {...aria} value={routingMode} onChange={(e) => setRoutingMode(e.target.value)}>
                  {ROUTING_MODES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Stream response</p>
                <p className="text-xs text-muted">Tokens appear as they are generated.</p>
              </div>
              <Switch checked={stream} onChange={setStream} label="Stream response" disabled={busy} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Agent mode"
            description="Hard limits applied by the router to each request."
            actions={<Switch checked={agentMode} onChange={setAgentMode} label="Enable Agent mode" />}
          />
          {agentMode && (
            <CardBody className="space-y-3">
              <Field label="Max cost per request (USD)" error={errors.maxCost} hint="Caps max_tokens so the worst case stays below this.">
                {(id, aria) => <Input id={id} {...aria} type="number" min={0} step="0.0001" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} placeholder="e.g. 0.01" className="num" />}
              </Field>
              <Field label="Min discount vs. baseline (%)" error={errors.minDiscount}>
                {(id, aria) => <Input id={id} {...aria} type="number" min={0} max={100} value={minDiscount} onChange={(e) => setMinDiscount(e.target.value)} placeholder="e.g. 20" className="num" />}
              </Field>
              <Field label="Max median latency (ms)" error={errors.maxLatency}>
                {(id, aria) => <Input id={id} {...aria} type="number" min={1} value={maxLatency} onChange={(e) => setMaxLatency(e.target.value)} placeholder="e.g. 2000" className="num" />}
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Required capabilities</legend>
                <div className="grid grid-cols-2 gap-2">
                  {CAPABILITIES.map((c) => (
                    <Checkbox
                      key={c.id}
                      label={c.label}
                      checked={caps.includes(c.id)}
                      onChange={(e) => setCaps((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                    />
                  ))}
                </div>
              </fieldset>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}

function MessageBubble({ message: m }: { message: ChatMessage }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white">{m.content}</div>
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-navy-700 dark:text-brand-200" aria-hidden>
          <User className="h-4 w-4" />
        </span>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" aria-hidden>
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 max-w-[90%] flex-1 space-y-2">
        {(m.content || m.pending) && (
          <div className="whitespace-pre-wrap break-words rounded-xl rounded-bl-sm border border-brand-100 bg-white px-4 py-2.5 text-sm text-slate-800 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-100">
            {m.content}
            {m.pending && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand-500 align-text-bottom" aria-label="Generating" />}
          </div>
        )}
        {m.stopped && <p className="text-xs text-muted">Stopped. If output had started streaming, the delivered tokens are billed.</p>}
        {m.error && <InferenceErrorNotice {...m.error} />}
        {m.meta && <ResponseMeta meta={m.meta} usage={m.usage} />}
      </div>
    </div>
  );
}

export function ResponseMeta({ meta, usage, compact }: { meta: StreamMeta; usage?: TokenUsage; compact?: boolean }) {
  const savings = meta.estimated_savings_usd;
  return (
    <div className={cn('rounded-lg border border-brand-50 bg-brand-50/40 px-3 py-2 text-xs text-slate-600 dark:border-navy-700 dark:bg-navy-900/60 dark:text-slate-300', compact && 'px-2.5')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Seller <span className="font-medium text-slate-800 dark:text-slate-100">{meta.seller}</span>
        </span>
        {meta.demo && <DemoBadge label="Demo · synthetic" title="Served by a demo endpoint: the text is synthetic, not real model output." />}
        <span className="num">
          Cost <span className="font-medium text-slate-800 dark:text-slate-100">{formatUsd(meta.cost_usd, { precise: true })}</span>
        </span>
        <span className="num">Baseline {meta.baseline_cost_usd !== null ? formatUsd(meta.baseline_cost_usd, { precise: true }) : 'n/a'}</span>
        {savings !== null && (
          <span className={cn('num', savings > 0 ? 'font-medium text-emerald-600 dark:text-emerald-400' : '')}>
            {savings >= 0 ? 'Est. savings' : 'Above baseline by'} {formatUsd(Math.abs(savings), { precise: true })}
          </span>
        )}
        <span className="num">Latency {formatMs(meta.latency_ms)}</span>
        {usage && (
          <span className="num">
            Tokens {formatNumber(usage.prompt_tokens)} in / {formatNumber(usage.completion_tokens)} out
            {meta.usage_estimated && (
              <Badge tone="warning" className="ml-1.5" title="The provider did not report usage; tokens were estimated">
                estimated
              </Badge>
            )}
          </span>
        )}
        <span className="num">Retries {meta.retries}</span>
      </div>
      {!compact && (
        <p className="mt-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-200">{meta.routing_mode.replace(/_/g, ' ').toLowerCase()}:</span> {meta.routing_reason}
        </p>
      )}
      <Link to={`/dashboard/usage?request=${encodeURIComponent(meta.request_id)}`} className="mt-1.5 inline-flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-300">
        View trace <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}
