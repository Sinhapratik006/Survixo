import { useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Plus, Star, X } from 'lucide-react';
import { Alert, Button, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { CatalogModel, ModelsResponse } from '@/types/api';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** Catalog models usable through the chat API, sorted by name. */
export function useApiModels() {
  return useQuery({
    queryKey: ['playground', 'catalog-models'],
    queryFn: () => api.get<ModelsResponse>('/api/models', { query: { sort: 'name' } }),
    staleTime: 60_000,
    select: (d) => d.data.filter((m) => m.apiSupported),
  });
}

export function isAvailable(m: CatalogModel) {
  return m.healthyOfferCount > 0;
}

export function modelLabel(m: CatalogModel) {
  return `${m.name} (${m.provider.name})${isAvailable(m) ? '' : ' - unavailable: no healthy offers'}${m.isDemo ? ' · demo' : ''}`;
}

export const CAPABILITIES = [
  { id: 'tools', label: 'Tool calling' },
  { id: 'vision', label: 'Vision' },
  { id: 'json_mode', label: 'JSON mode' },
  { id: 'streaming', label: 'Streaming' },
] as const;

export type CapabilityId = (typeof CAPABILITIES)[number]['id'];

/** Known error codes mapped to the page where the user can fix them. */
const ERROR_HINTS: Record<string, { text: string; to: string; label: string }> = {
  insufficient_balance: { text: 'Your organization balance cannot cover the worst-case cost of this request.', to: '/dashboard/billing', label: 'Add credits in Billing' },
  budget_exceeded: { text: 'A budget limit blocked this request.', to: '/dashboard/billing#budget', label: 'Review budgets' },
  no_eligible_offer: { text: 'No offer satisfied the routing constraints (policy, Agent mode limits or capabilities).', to: '/dashboard/routing', label: 'Review routing policies' },
  no_offers_for_model: { text: 'No seller currently offers this model.', to: '/models', label: 'Browse available models' },
  max_cost_too_low: { text: 'The max cost is too low for the prompt on any eligible offer. Raise Agent mode max cost or shorten the prompt.', to: '/dashboard/routing', label: 'Review routing' },
  model_not_found: { text: 'This model is not in the catalog.', to: '/models', label: 'Browse models' },
  unsupported_model: { text: 'This model is listed but not available through the chat API.', to: '/models', label: 'Browse models' },
};

export function errorInfo(err: unknown): { message: string; code?: string; requestId?: string } {
  if (err instanceof ApiError) {
    const d = err.details as { request_id?: string } | undefined;
    return { message: err.message, code: err.code, requestId: d?.request_id };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: 'Something went wrong' };
}

export function InferenceErrorNotice({ message, code, requestId, className }: { message: string; code?: string; requestId?: string | null; className?: string }) {
  const hint = code ? (ERROR_HINTS[code] ?? (code.includes('budget') ? ERROR_HINTS.budget_exceeded : undefined)) : undefined;
  return (
    <Alert tone="danger" className={className} title={code ? `Request failed · ${code}` : 'Request failed'}>
      <p className="break-words">{message}</p>
      {hint && (
        <p className="mt-1">
          {hint.text}{' '}
          <Link to={hint.to} className="font-medium underline underline-offset-2">
            {hint.label}
          </Link>
        </p>
      )}
      {requestId && (
        <p className="mt-1">
          <Link to={`/dashboard/usage?request=${encodeURIComponent(requestId)}`} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
            View trace <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </p>
      )}
    </Alert>
  );
}

/** 2–4 (or 1–4) model dropdowns with add/remove controls. */
export function ModelSlots({
  models,
  value,
  onChange,
  min = 2,
  max = 4,
  label = 'Model',
  disabled,
}: {
  models: CatalogModel[];
  value: string[];
  onChange: (v: string[]) => void;
  min?: number;
  max?: number;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      {value.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <label htmlFor={`${id}-${i}`} className="sr-only">
            {label} {i + 1}
          </label>
          <Select
            id={`${id}-${i}`}
            value={v}
            disabled={disabled}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
          >
            <option value="">Select {label.toLowerCase()} {i + 1}…</option>
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={value.includes(m.id) && m.id !== v}>
                {modelLabel(m)}
              </option>
            ))}
          </Select>
          {value.length > min && (
            <Button variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {value.length < max && (
        <Button variant="outline" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} disabled={disabled} onClick={() => onChange([...value, ''])}>
          Add {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

/** 1–5 rating as a native radio group rendered as stars (keyboard operable with arrow keys). */
export function StarRating({ label, value, onChange, size = 'md' }: { label: string; value: number | undefined; onChange: (v: number) => void; size?: 'sm' | 'md' }) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={cn('mb-1 font-medium text-slate-700 dark:text-slate-200', size === 'sm' ? 'text-xs' : 'text-sm')}>{label}</legend>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer rounded p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-400">
            <input type="radio" className="sr-only" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
            <span className="sr-only">
              {n} of 5
            </span>
            <Star
              aria-hidden
              className={cn(
                size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
                value !== undefined && n <= value ? 'fill-cyan-500 text-cyan-500' : 'text-slate-300 dark:text-navy-500',
              )}
            />
          </label>
        ))}
        {value !== undefined && <span className="num ml-1.5 text-xs text-muted">{value}/5</span>}
      </div>
    </fieldset>
  );
}

export function parseOptionalNumber(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}
