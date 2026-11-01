import { Prisma, type TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type Tx = Prisma.TransactionClient;

export function utcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Reserve funds before dispatching an inference request. Atomic: succeeds only
 * if the available balance covers the hold, so concurrent requests cannot
 * overdraw the account.
 */
export async function placeHold(orgId: string, micros: bigint): Promise<boolean> {
  if (micros <= 0n) return true;
  const rows = await prisma.$executeRaw`
    UPDATE "Organization" SET "balanceMicros" = "balanceMicros" - ${micros}, "heldMicros" = "heldMicros" + ${micros}
    WHERE id = ${orgId} AND "balanceMicros" >= ${micros}`;
  return rows === 1;
}

export async function releaseHold(orgId: string, micros: bigint, tx: Tx = prisma): Promise<void> {
  if (micros <= 0n) return;
  await tx.$executeRaw`
    UPDATE "Organization" SET "balanceMicros" = "balanceMicros" + ${micros}, "heldMicros" = GREATEST("heldMicros" - ${micros}, 0)
    WHERE id = ${orgId}`;
}

export interface SettleInput {
  requestId: string;
  orgId: string;
  apiKeyId: string | null;
  modelId: string;
  offerId: string;
  sellerOrgId: string;
  holdMicros: bigint;
  costMicros: bigint;
  feeMicros: bigint;
  sellerMicros: bigint;
  baselineMicros: bigint | null;
  inputTokens: number;
  outputTokens: number;
  usageEstimated: boolean;
  latencyMs: number;
  ttftMs: number | null;
  retryCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

async function upsertUsage(
  tx: Tx,
  orgId: string,
  apiKeyId: string | null,
  modelId: string,
  delta: { requests: number; failures: number; inputTokens: number; outputTokens: number; cost: bigint; baseline: bigint },
) {
  const day = utcDay();
  const keyScope = apiKeyId ?? 'dashboard';
  await tx.usageRecord.upsert({
    where: { orgId_keyScope_modelId_day: { orgId, keyScope, modelId, day } },
    create: {
      orgId,
      apiKeyId,
      modelId,
      day,
      keyScope,
      requests: delta.requests,
      failures: delta.failures,
      inputTokens: BigInt(delta.inputTokens),
      outputTokens: BigInt(delta.outputTokens),
      costMicros: delta.cost,
      baselineCostMicros: delta.baseline,
    },
    update: {
      requests: { increment: delta.requests },
      failures: { increment: delta.failures },
      inputTokens: { increment: BigInt(delta.inputTokens) },
      outputTokens: { increment: BigInt(delta.outputTokens) },
      costMicros: { increment: delta.cost },
      baselineCostMicros: { increment: delta.baseline },
    },
  });
}

/**
 * Settle a completed request in one database transaction: release the hold,
 * debit the actual cost, credit the seller's earnings (minus platform fee),
 * update the daily usage rollup and per-key spend. The unique constraint on
 * (type, requestId) guarantees a request can never be billed twice.
 */
export async function settleSuccess(input: SettleInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [buyer] = await tx.$queryRaw<Array<{ balanceMicros: bigint }>>`
      UPDATE "Organization"
      SET "balanceMicros" = "balanceMicros" + ${input.holdMicros} - ${input.costMicros},
          "heldMicros" = GREATEST("heldMicros" - ${input.holdMicros}, 0)
      WHERE id = ${input.orgId} RETURNING "balanceMicros"`;
    await tx.billingTransaction.create({
      data: {
        orgId: input.orgId,
        type: 'USAGE_DEBIT',
        amountMicros: -input.costMicros,
        balanceAfterMicros: buyer?.balanceMicros ?? null,
        requestId: input.requestId,
        description: `Inference ${input.modelId} (${input.inputTokens} in / ${input.outputTokens} out tokens)`,
      },
    });
    const [seller] = await tx.$queryRaw<Array<{ sellerBalanceMicros: bigint }>>`
      UPDATE "Organization" SET "sellerBalanceMicros" = "sellerBalanceMicros" + ${input.sellerMicros}
      WHERE id = ${input.sellerOrgId} RETURNING "sellerBalanceMicros"`;
    await tx.billingTransaction.create({
      data: {
        orgId: input.sellerOrgId,
        type: 'SELLER_EARNING',
        account: 'SELLER',
        amountMicros: input.sellerMicros,
        balanceAfterMicros: seller?.sellerBalanceMicros ?? null,
        requestId: input.requestId,
        description: `Served ${input.modelId} (platform fee ${(Number(input.feeMicros) / 1e6).toFixed(6)} USD)`,
      },
    });
    await upsertUsage(tx, input.orgId, input.apiKeyId, input.modelId, {
      requests: 1,
      failures: 0,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cost: input.costMicros,
      baseline: input.baselineMicros ?? 0n,
    });
    if (input.apiKeyId) {
      await tx.apiKey.update({
        where: { id: input.apiKeyId },
        data: { spentMicros: { increment: input.costMicros }, lastUsedAt: new Date() },
      });
    }
    await tx.inferenceRequest.update({
      where: { id: input.requestId },
      data: {
        status: 'SUCCESS',
        offerId: input.offerId,
        sellerOrgId: input.sellerOrgId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        usageEstimated: input.usageEstimated,
        costMicros: input.costMicros,
        platformFeeMicros: input.feeMicros,
        sellerEarningMicros: input.sellerMicros,
        baselineCostMicros: input.baselineMicros,
        latencyMs: input.latencyMs,
        ttftMs: input.ttftMs,
        retryCount: input.retryCount,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        completedAt: new Date(),
      },
    });
  });
}

export async function settleFailure(input: {
  requestId: string;
  orgId: string;
  apiKeyId: string | null;
  modelId: string | null;
  holdMicros: bigint;
  status: 'FAILED' | 'REJECTED';
  httpStatus: number;
  errorCode: string;
  errorMessage: string;
  latencyMs: number | null;
  retryCount: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await releaseHold(input.orgId, input.holdMicros, tx);
    if (input.modelId) {
      await upsertUsage(tx, input.orgId, input.apiKeyId, input.modelId, {
        requests: 1,
        failures: 1,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0n,
        baseline: 0n,
      });
    }
    await tx.inferenceRequest.update({
      where: { id: input.requestId },
      data: {
        status: input.status,
        httpStatus: input.httpStatus,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        latencyMs: input.latencyMs,
        retryCount: input.retryCount,
        completedAt: new Date(),
      },
    });
  });
}

/** Idempotent balance credit (purchases, demo credits, refunds, adjustments). */
export async function creditBalance(input: {
  orgId: string;
  amountMicros: bigint;
  type: Extract<TransactionType, 'CREDIT_PURCHASE' | 'DEMO_CREDIT' | 'REFUND' | 'ADJUSTMENT'>;
  paymentRef: string;
  description: string;
}): Promise<{ applied: boolean }> {
  try {
    await prisma.$transaction(async (tx) => {
      const [org] = await tx.$queryRaw<Array<{ balanceMicros: bigint }>>`
        UPDATE "Organization" SET "balanceMicros" = "balanceMicros" + ${input.amountMicros}
        WHERE id = ${input.orgId} RETURNING "balanceMicros"`;
      if (!org) throw new Error('Organization not found');
      if (org.balanceMicros < 0n && input.amountMicros < 0n) throw new Error('Adjustment would make the balance negative');
      await tx.billingTransaction.create({
        data: {
          orgId: input.orgId,
          type: input.type,
          amountMicros: input.amountMicros,
          balanceAfterMicros: org.balanceMicros,
          paymentRef: input.paymentRef,
          description: input.description,
        },
      });
    });
    return { applied: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { applied: false };
    throw err;
  }
}

/** Move seller earnings into a payout request. Atomic; fails if the seller balance is insufficient. */
export async function requestPayout(orgId: string, amountMicros: bigint, destination: string | null, userId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ sellerBalanceMicros: bigint }>>`
      UPDATE "Organization" SET "sellerBalanceMicros" = "sellerBalanceMicros" - ${amountMicros}
      WHERE id = ${orgId} AND "sellerBalanceMicros" >= ${amountMicros} RETURNING "sellerBalanceMicros"`;
    if (!rows.length) return null;
    const payout = await tx.payout.create({
      data: { orgId, amountMicros, destination, requestedById: userId, status: 'REQUESTED' },
    });
    await tx.billingTransaction.create({
      data: {
        orgId,
        type: 'PAYOUT',
        account: 'SELLER',
        status: 'PENDING',
        amountMicros: -amountMicros,
        balanceAfterMicros: rows[0]!.sellerBalanceMicros,
        payoutId: payout.id,
        paymentRef: `payout:${payout.id}`,
        description: 'Payout requested',
      },
    });
    return payout;
  });
}

export async function failPayout(payoutId: string, note: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!payout || !['REQUESTED', 'PROCESSING'].includes(payout.status)) return null;
    const [org] = await tx.$queryRaw<Array<{ sellerBalanceMicros: bigint }>>`
      UPDATE "Organization" SET "sellerBalanceMicros" = "sellerBalanceMicros" + ${payout.amountMicros}
      WHERE id = ${payout.orgId} RETURNING "sellerBalanceMicros"`;
    await tx.billingTransaction.updateMany({ where: { payoutId, type: 'PAYOUT' }, data: { status: 'FAILED' } });
    await tx.billingTransaction.create({
      data: {
        orgId: payout.orgId,
        type: 'PAYOUT_REVERSAL',
        account: 'SELLER',
        amountMicros: payout.amountMicros,
        balanceAfterMicros: org?.sellerBalanceMicros ?? null,
        payoutId,
        paymentRef: `payout-reversal:${payoutId}`,
        description: `Payout returned to balance: ${note}`,
      },
    });
    return tx.payout.update({ where: { id: payoutId }, data: { status: payout.status === 'REQUESTED' ? 'CANCELLED' : 'FAILED', note, processedAt: new Date() } });
  });
}
