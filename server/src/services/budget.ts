import type { Budget } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { paymentRequired } from '../lib/errors.js';
import { microsToUsd } from '../lib/money.js';
import { emitEvent } from './events.js';

export const orgBudgetScope = (orgId: string) => `org:${orgId}`;
export const projectBudgetScope = (projectId: string) => `project:${projectId}`;

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Settled spend plus funds held by in-flight requests since `since`. */
export async function spendSince(orgId: string, since: Date, projectId?: string | null): Promise<{ settled: bigint; inFlight: bigint }> {
  const where = { orgId, createdAt: { gte: since }, ...(projectId ? { projectId } : {}) };
  const [settled, inFlight] = await Promise.all([
    prisma.inferenceRequest.aggregate({ where: { ...where, status: 'SUCCESS' }, _sum: { costMicros: true } }),
    prisma.inferenceRequest.aggregate({ where: { ...where, status: 'IN_PROGRESS' }, _sum: { holdMicros: true } }),
  ]);
  return { settled: settled._sum.costMicros ?? 0n, inFlight: inFlight._sum.holdMicros ?? 0n };
}

export async function getBudgets(orgId: string, projectId?: string | null): Promise<Budget[]> {
  const scopes = [orgBudgetScope(orgId), ...(projectId ? [projectBudgetScope(projectId)] : [])];
  return prisma.budget.findMany({ where: { scopeKey: { in: scopes } } });
}

/** Smallest per-request cap among applicable budgets (null = none). */
export function perRequestCap(budgets: Budget[]): bigint | null {
  // Soft budgets (hardLimit=false) only alert; they never shrink requests.
  const caps = budgets.filter((b) => b.hardLimit).map((b) => b.maxPerRequestMicros).filter((v): v is bigint => v !== null);
  return caps.length ? caps.reduce((a, b) => (a < b ? a : b)) : null;
}

export interface BudgetCheckInput {
  orgId: string;
  projectId: string | null;
  apiKey: { id: string; spendLimitMicros: bigint | null; spentMicros: bigint } | null;
  taskId: string | null;
  estimateMicros: bigint;
  budgets: Budget[];
}

/**
 * Smart Budget Guard - enforced server-side before a request is dispatched.
 * `estimateMicros` is the worst-case reserved hold for the request, so a
 * request that passes cannot exceed a hard limit by more than other requests
 * already in flight.
 */
export async function enforceBudgets(input: BudgetCheckInput): Promise<void> {
  const { apiKey, estimateMicros } = input;
  if (apiKey?.spendLimitMicros != null && apiKey.spentMicros + estimateMicros > apiKey.spendLimitMicros) {
    throw paymentRequired('This API key has reached its spending limit.', 'key_spend_limit_exceeded', {
      limit_usd: microsToUsd(apiKey.spendLimitMicros),
      spent_usd: microsToUsd(apiKey.spentMicros),
      estimate_usd: microsToUsd(estimateMicros),
    });
  }

  for (const budget of input.budgets) {
    if (!budget.hardLimit) continue;
    const projectId = budget.projectId;
    if (budget.maxPerRequestMicros != null && estimateMicros > budget.maxPerRequestMicros) {
      throw paymentRequired('The worst-case cost of this request exceeds your per-request budget.', 'request_budget_exceeded', {
        max_per_request_usd: microsToUsd(budget.maxPerRequestMicros),
        estimate_usd: microsToUsd(estimateMicros),
        hint: 'Lower max_tokens or raise the per-request limit.',
      });
    }
    if (budget.dailyLimitMicros != null) {
      const s = await spendSince(input.orgId, startOfUtcDay(), projectId);
      if (s.settled + s.inFlight + estimateMicros > budget.dailyLimitMicros)
        throw paymentRequired('Daily budget limit reached.', 'daily_budget_exceeded', {
          limit_usd: microsToUsd(budget.dailyLimitMicros),
          spent_usd: microsToUsd(s.settled),
          in_flight_usd: microsToUsd(s.inFlight),
        });
    }
    if (budget.monthlyLimitMicros != null) {
      const s = await spendSince(input.orgId, startOfUtcMonth(), projectId);
      if (s.settled + s.inFlight + estimateMicros > budget.monthlyLimitMicros)
        throw paymentRequired('Monthly budget limit reached.', 'monthly_budget_exceeded', {
          limit_usd: microsToUsd(budget.monthlyLimitMicros),
          spent_usd: microsToUsd(s.settled),
          in_flight_usd: microsToUsd(s.inFlight),
        });
    }
    if (budget.maxPerTaskMicros != null && input.taskId) {
      const [settled, inFlight] = await Promise.all([
        prisma.inferenceRequest.aggregate({
          where: { orgId: input.orgId, taskId: input.taskId, status: 'SUCCESS' },
          _sum: { costMicros: true },
        }),
        prisma.inferenceRequest.aggregate({
          where: { orgId: input.orgId, taskId: input.taskId, status: 'IN_PROGRESS' },
          _sum: { holdMicros: true },
        }),
      ]);
      const used = (settled._sum.costMicros ?? 0n) + (inFlight._sum.holdMicros ?? 0n);
      if (used + estimateMicros > budget.maxPerTaskMicros)
        throw paymentRequired('This task has reached its budget.', 'task_budget_exceeded', {
          task_id: input.taskId,
          limit_usd: microsToUsd(budget.maxPerTaskMicros),
          spent_usd: microsToUsd(used),
        });
    }
  }
}

export interface BudgetStatus {
  budget: Budget | null;
  daySpentMicros: bigint;
  monthSpentMicros: bigint;
  inFlightMicros: bigint;
}

export async function budgetStatus(orgId: string): Promise<BudgetStatus> {
  const budget = await prisma.budget.findUnique({ where: { scopeKey: orgBudgetScope(orgId) } });
  const [day, month] = await Promise.all([spendSince(orgId, startOfUtcDay()), spendSince(orgId, startOfUtcMonth())]);
  return { budget, daySpentMicros: day.settled, monthSpentMicros: month.settled, inFlightMicros: month.inFlight };
}

/** Fire threshold alerts once per budget period (unique constraint makes this idempotent). */
export async function evaluateBudgetAlerts(orgId: string, projectId: string | null): Promise<void> {
  const budgets = await getBudgets(orgId, projectId);
  for (const budget of budgets) {
    const periods: Array<{ key: string; label: string; limit: bigint | null; since: Date }> = [
      { key: `day:${startOfUtcDay().toISOString().slice(0, 10)}`, label: 'daily', limit: budget.dailyLimitMicros, since: startOfUtcDay() },
      { key: `month:${startOfUtcMonth().toISOString().slice(0, 7)}`, label: 'monthly', limit: budget.monthlyLimitMicros, since: startOfUtcMonth() },
    ];
    for (const p of periods) {
      if (!p.limit || p.limit <= 0n) continue;
      const s = await spendSince(orgId, p.since, budget.projectId);
      const pct = Number((s.settled * 10_000n) / p.limit) / 100;
      const crossed = budget.alertThresholds.filter((t) => pct >= t).sort((a, b) => b - a)[0];
      if (crossed === undefined) continue;
      const created = await prisma.budgetAlert.createMany({
        data: [{ budgetId: budget.id, period: p.key, threshold: crossed }],
        skipDuplicates: true,
      });
      if (!created.count) continue; // already alerted for this threshold in this period
      await emitEvent({
        orgId,
        type: 'budget.threshold',
        severity: crossed >= 100 ? 'critical' : 'warning',
        title: `${crossed}% of ${p.label} budget used`,
        body: `Spent $${microsToUsd(s.settled).toFixed(2)} of $${microsToUsd(p.limit).toFixed(2)} ${p.label} budget${budget.projectId ? ' for a project' : ''}.${
          budget.hardLimit && crossed >= 100 ? ' New requests are blocked until the period resets or the limit is raised.' : ''
        }`,
        data: { threshold: crossed, period: p.key, spent_usd: microsToUsd(s.settled), limit_usd: microsToUsd(p.limit), project_id: budget.projectId },
      });
    }
  }
}
