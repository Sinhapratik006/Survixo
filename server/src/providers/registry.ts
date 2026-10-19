import { env } from '../config/env.js';
import { demoAdapter } from './demo.js';
import { openaiCompatibleAdapter } from './openaiCompatible.js';
import type { ProviderAdapter } from './types.js';

const adapters: Record<string, ProviderAdapter> = {
  [openaiCompatibleAdapter.id]: openaiCompatibleAdapter,
  [demoAdapter.id]: demoAdapter,
};

export function getAdapter(id: string): ProviderAdapter {
  if (id === 'demo' && !env.DEMO_MODE) throw new Error('Demo adapter is disabled (DEMO_MODE=false)');
  const adapter = adapters[id];
  if (!adapter) throw new Error(`Unknown adapter: ${id}`);
  return adapter;
}

export function availableAdapters() {
  return Object.values(adapters)
    .filter((a) => a.id !== 'demo' || env.DEMO_MODE)
    .map((a) => ({ id: a.id, label: a.label, features: a.features, auth: a.auth }));
}
