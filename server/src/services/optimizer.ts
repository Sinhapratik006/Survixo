import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { microsToUsd } from '../lib/money.js';
import { blendedPrice, getCatalog } from './catalog.js';
import { budgetStatus } from './budget.js';

export type OptimizerAction =
  | { kind: 'apply_routing_mode'; policyId: string; mode: 'LOWEST_COST' | 'BALANCED' }
  | { kind: 'link'; href: string; label: string };

export interface OptimizerRecommendation {
  id: string;
  type: 'model_substitution' | 'routing_policy' | 'token_reduction' | 'budget' | 'prompt_caching' | 'batching';
  title: string;
  detail: string;
  projectedMonthlySavingsUsd: number | null;
  assumptions: string[];
  action: OptimizerAction | null;
  requiresApproval: boolean;
}

const rid = (...parts: string[]) => createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);

/**
 * Automatic Cost Optimizer: analyzes the last 30 days of recorded usage and
 * proposes changes with explicit assumptions. Nothing is changed without an
 * explicit approval call.
 */
export async function analyzeUsage(orgId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [usage, catalog, policy, budget, reqStats] = await Promise.all([
    prisma.usageRecord.groupBy({
      by: ['modelId'],
      where: { orgId, day: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true, costMicros: true, requests: true },
    }),
    getCatalog(),
    prisma.routingPolicy.findFirst({ where: { orgId, isDefault: true } }),
    budgetStatus(orgId),
    prisma.inferenceRequest.aggregate({ where: { orgId, createdAt: { gte: since }, status: 'SUCCESS' }, _avg: { inputTokens: true, outputTokens: true }, _count: { _all: true } }),
  ]);
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const recs: OptimizerRecommendation[] = [];
  const notApplicable: string[] = [];
  const totalCost = usage.reduce((s, u) => s + microsToUsd(u._sum.costMicros), 0);

  for (const u of usage) {
    const current = byId.get(u.modelId);
    const inTok = Number(u._sum.inputTokens ?? 0n);
    const outTok = Number(u._sum.outputTokens ?? 0n);
    const cost = microsToUsd(u._sum.costMicros);
    if (!current || cost <= 0 || inTok + outTok === 0) continue;
    const currentCaps = new Set(current.capabilities.map((c) => c.capability));

    // Better routing for the same model.
    if (current.bestOffer && policy && policy.mode !== 'LOWEST_COST') {
      const bestCost = (inTok * current.bestOffer.inputPerM + outTok * current.bestOffer.outputPerM) / 1e6;
      if (bestCost < cost * 0.97) {
        recs.push({
          id: rid('routing', u.modelId, policy.id),
          type: 'routing_policy',
          title: `Route ${current.name} by lowest cost`,
          detail: `Your default policy "${policy.name}" uses ${policy.mode.replace('_', ' ').toLowerCase()} routing. The cheapest healthy offer for ${current.name} would have cost $${bestCost.toFixed(4)} instead of $${cost.toFixed(4)} for the same tokens.`,
          projectedMonthlySavingsUsd: Number((cost - bestCost).toFixed(4)),
          assumptions: ['Same token volume as the last 30 days', 'Current best offer price stays unchanged', 'Latency/quality trade-offs of the cheaper offer are acceptable'],
          action: { kind: 'apply_routing_mode', policyId: policy.id, mode: 'LOWEST_COST' },
          requiresApproval: true,
        });
      }
    }

    // Less expensive compatible models.
    const alternatives = catalog
      .filter(
        (m) =>
          m.id !== current.id &&
          m.apiSupported &&
          m.bestOffer &&
          [...currentCaps].every((c) => m.capabilities.some((x) => x.capability === c)) &&
          (current.contextWindow === null || (m.contextWindow ?? 0) >= current.contextWindow),
      )
      .map((m) => ({ m, cost: (inTok * m.bestOffer!.inputPerM + outTok * m.bestOffer!.outputPerM) / 1e6 }))
      .filter((a) => a.cost < cost * 0.8)
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 2);
    for (const alt of alternatives) {
      const qualityNote =
        alt.m.qualityScore !== null && current.qualityScore !== null
          ? `Measured benchmark score: ${(alt.m.qualityScore * 100).toFixed(0)}% vs ${(current.qualityScore * 100).toFixed(0)}%.`
          : 'No comparable benchmark results exist, so output quality may differ - evaluate it in the Arena first.';
      recs.push({
        id: rid('substitute', u.modelId, alt.m.id),
        type: 'model_substitution',
        title: `Try ${alt.m.name} instead of ${current.name}`,
        detail: `${alt.m.name} declares the same capabilities and an equal or larger context window. The same tokens would cost ~$${alt.cost.toFixed(4)} vs $${cost.toFixed(4)}. ${qualityNote}`,
        projectedMonthlySavingsUsd: Number((cost - alt.cost).toFixed(4)),
        assumptions: ['Same token counts (tokenizers differ between models)', 'Current best offer prices', 'Capability parity is based on declared catalog data'],
        action: { kind: 'link', href: `/dashboard/playground?tab=arena&models=${encodeURIComponent(`${current.id},${alt.m.id}`)}`, label: 'Compare in Arena' },
        requiresApproval: true,
      });
    }

    for (const [cap, type, label] of [
      ['prompt_caching', 'prompt_caching', 'Prompt caching'],
      ['batch', 'batching', 'Batch processing'],
    ] as const) {
      if (currentCaps.has(cap)) {
        recs.push({
          id: rid(type, u.modelId),
          type,
          title: `${label} is available for ${current.name}`,
          detail: `${label} is declared for this model. Savings depend on how much of your traffic can use it.`,
          projectedMonthlySavingsUsd: null,
          assumptions: ['Savings are not estimated because offer-level pricing for this feature is not recorded'],
          action: null,
          requiresApproval: false,
        });
      }
    }
  }
  if (!recs.some((r) => r.type === 'prompt_caching')) notApplicable.push('Prompt caching: none of the models you use declare support on Nexovra yet.');
  if (!recs.some((r) => r.type === 'batching')) notApplicable.push('Batch processing: no batch API is offered for the models you use.');

  const avgIn = reqStats._avg.inputTokens ?? 0;
  if (reqStats._count._all >= 20 && avgIn > 4000 && totalCost > 0) {
    const inputShare = usage.reduce((s, u) => {
      const m = byId.get(u.modelId);
      return s + (m?.bestOffer ? (Number(u._sum.inputTokens ?? 0n) * m.bestOffer.inputPerM) / 1e6 : 0);
    }, 0);
    recs.push({
      id: rid('tokens', orgId),
      type: 'token_reduction',
      title: 'Trim long prompts',
      detail: `Your average prompt is ~${Math.round(avgIn).toLocaleString()} tokens. Summarizing history or retrieving fewer documents reduces input cost.`,
      projectedMonthlySavingsUsd: Number((inputShare * 0.2).toFixed(4)),
      assumptions: ['A 20% reduction in input tokens', 'Output tokens unchanged', 'Priced at current best offers'],
      action: null,
      requiresApproval: false,
    });
  }

  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projected = (microsToUsd(budget.monthSpentMicros) / Math.max(1, now.getUTCDate())) * daysInMonth;
  const limit = budget.budget?.monthlyLimitMicros != null ? microsToUsd(budget.budget.monthlyLimitMicros) : null;
  if (projected > 0 && limit === null) {
    recs.push({
      id: rid('budget-set', orgId),
      type: 'budget',
      title: 'Set a monthly budget',
      detail: `At the current pace you will spend about $${projected.toFixed(2)} this month. A hard monthly limit (e.g. $${Math.ceil(projected * 1.2)}) prevents surprises.`,
      projectedMonthlySavingsUsd: null,
      assumptions: ['Linear projection from month-to-date spend'],
      action: { kind: 'link', href: '/dashboard/billing#budget', label: 'Configure budget' },
      requiresApproval: false,
    });
  } else if (limit !== null && projected > limit) {
    recs.push({
      id: rid('budget-raise', orgId),
      type: 'budget',
      title: 'Projected to exceed your monthly budget',
      detail: `Projected spend $${projected.toFixed(2)} exceeds your $${limit.toFixed(2)} limit; with hard limits on, requests will be blocked once it is reached.`,
      projectedMonthlySavingsUsd: null,
      assumptions: ['Linear projection from month-to-date spend'],
      action: { kind: 'link', href: '/dashboard/billing#budget', label: 'Review budget' },
      requiresApproval: false,
    });
  }

  recs.sort((a, b) => (b.projectedMonthlySavingsUsd ?? -1) - (a.projectedMonthlySavingsUsd ?? -1));
  return {
    windowDays: 30,
    analyzedSpendUsd: Number(totalCost.toFixed(6)),
    recommendations: recs,
    notApplicable,
    note: 'Projections use recorded usage and current offer prices. They are estimates, not guaranteed savings. Nothing changes until you approve it.',
  };
}

export { blendedPrice };
