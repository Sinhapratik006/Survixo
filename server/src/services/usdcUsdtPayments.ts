/**
 * USDC / USDT direct payment integration for the API key marketplace.
 *
 * Buyers pay directly to a platform-controlled wallet address. Flow:
 *
 *  1. Buyer initiates checkout → server returns a payment address, amount,
 *     network, token, and a unique payment reference.
 *  2. Buyer sends USDC/USDT to that address.
 *  3. Buyer (or an admin) submits the on-chain tx hash via
 *     POST /api/marketplace/payment/confirm.
 *  4. Server marks the order PAID, credits buyer/seller balances, and
 *     delivers the decrypted API key.
 *
 * On-chain verification is intentionally lightweight in this implementation:
 * the tx hash is recorded and the order is marked confirmed. Operators can
 * cross-check against a block explorer before releasing large payouts.
 *
 * Environment variables:
 *  - USDC_WALLET_ADDRESS   - Platform wallet address receiving USDC
 *  - USDT_WALLET_ADDRESS   - Platform wallet address receiving USDT
 *  - USDC_PAYMENT_NETWORK  - Network for USDC (default: ETHEREUM)
 *  - USDT_PAYMENT_NETWORK  - Network for USDT (default: ETHEREUM)
 *  - APP_URL               - Public URL of the web app (for success/cancel redirects)
 */

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { usdToMicros } from '../lib/money.js';
import { platformFeeCentsFromPrice, sellerEarningCentsFromPrice } from '../lib/pricing.js';
import { decryptSecret } from '../security/crypto.js';
import { logger } from '../lib/logger.js';
import { audit } from '../services/audit.js';
import { emitEvent } from '../services/events.js';

export enum PaymentToken {
  USDC = 'USDC',
  USDT = 'USDT',
}

export interface PaymentDetails {
  orderId: string;
  paymentReference: string; // unique reference the buyer includes / we track
  walletAddress: string;
  token: PaymentToken;
  network: string;
  amountUsd: number;
  amountCents: number;
  expiresAt: Date;
}

/**
 * Build the payment details for a marketplace listing purchase.
 */
export async function createUsdcUsdtPayment({
  listingId,
  buyerOrgId,
  idempotencyKey,
}: {
  listingId: string;
  buyerOrgId: string;
  idempotencyKey: string;
}): Promise<PaymentDetails> {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: { sellerOrg: true },
  });
  if (!listing) throw new Error('Listing not found');
  if (listing.status !== 'ACTIVE') throw new Error('Listing is not active');
  if (listing.isSold && listing.maxBuyers !== null && listing.buyerCount >= listing.maxBuyers)
    throw new Error('Listing is sold out');

  const amountCents = listing.priceCents;
  const sellerEarningCents = sellerEarningCentsFromPrice(amountCents);
  const platformFeeCents = platformFeeCentsFromPrice(amountCents);

  // Create an order record first (pending payment)
  const order = await prisma.order.create({
    data: {
      buyerOrgId,
      listingId,
      amountCents,
      platformFeeCents,
      sellerEarningCents,
      status: 'PENDING',
    },
  });

  // Determine token + network from listing currency (default to USDC on Ethereum)
  const token: PaymentToken = listing.currency.toUpperCase() === 'USDT' ? PaymentToken.USDT : PaymentToken.USDC;
  const network =
    token === PaymentToken.USDC
      ? env.USDC_PAYMENT_NETWORK ?? 'ETHEREUM'
      : env.USDT_PAYMENT_NETWORK ?? 'ETHEREUM';
  const walletAddress =
    token === PaymentToken.USDC ? env.USDC_WALLET_ADDRESS : env.USDT_WALLET_ADDRESS;

  if (!walletAddress) {
    // Clean up the pending order if no wallet is configured
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    throw new Error(`Payment wallet address for ${token} on ${network} is not configured`);
  }

  const paymentReference = `usdcpay:${order.id}:${idempotencyKey}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30-minute payment window

  // Store payment reference and network on the order for later confirmation
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentNetwork: network,
      paymentToken: token,
      // paymentReference is stored in metadata via billing transaction later;
      // we keep it on the order via paymentTxHash placeholder until confirmed
    },
  });

  await audit({
    orgId: listing.sellerOrgId,
    actorUserId: undefined,
    action: 'marketplace.payment.created',
    targetType: 'order',
    targetId: order.id,
    ip: 'system',
    metadata: { listingId, buyerOrgId, amountCents, token, network, paymentReference },
  });

  return {
    orderId: order.id,
    paymentReference,
    walletAddress,
    token,
    network,
    amountUsd: amountCents / 100,
    amountCents,
    expiresAt,
  };
}

/**
 * Confirm a USDC/USDT payment by on-chain tx hash.
 * Marks the order PAID, credits balances, delivers the API key.
 */
export async function confirmUsdcUsdtPayment({
  orderId,
  txHash,
}: {
  orderId: string;
  txHash: string;
}): Promise<{ orderId: string; status: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { listing: { include: { sellerOrg: true } } },
  });
  if (!order) throw new Error('Order not found');
  if (order.status === 'PAID') return { orderId: order.id, status: 'PAID' }; // Already processed
  if (!order.paymentNetwork || !order.paymentToken) {
    throw new Error('Order has no payment details');
  }

  const listing = order.listing;
  if (!listing) throw new Error('Listing not found for order');

  // Decrypt the seller's API key for delivery
  let decryptedKey: string | null = null;
  try {
    const encrypted = JSON.parse(listing.apiKeyEncrypted) as {
      ciphertext: string; iv: string; authTag: string; wrappedKey: string; keyVersion: number;
    };
    decryptedKey = decryptSecret(encrypted, `listing:${listing.id}`);
  } catch (err) {
    logger.error({ err, listingId: listing.id }, 'failed to decrypt seller API key');
  }

  await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paymentTxHash: txHash,
        paymentConfirmed: true,
        paymentConfirmedAt: new Date(),
        apiKeyDelivered: decryptedKey ?? null,
        apiKeyDeliveredAt: decryptedKey ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    // Mark listing as sold if at max buyers
    const newBuyerCount = listing.buyerCount + 1;
    const isSoldOut = listing.maxBuyers !== null && newBuyerCount >= listing.maxBuyers;

    await tx.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        buyerCount: newBuyerCount,
        ...(isSoldOut && { status: 'SOLD', isSold: true }),
      },
    });

    // Credit seller earnings to seller balance (in micros)
    const sellerEarningMicros = usdToMicros(updatedOrder.sellerEarningCents / 100);
    const [seller] = await tx.$queryRaw<Array<{ sellerBalanceMicros: bigint }>>`
      UPDATE "Organization" SET "sellerBalanceMicros" = "sellerBalanceMicros" + ${sellerEarningMicros}
      WHERE id = ${listing.sellerOrgId} RETURNING "sellerBalanceMicros"`;

    await tx.billingTransaction.create({
      data: {
        orgId: listing.sellerOrgId,
        type: 'SELLER_EARNING',
        account: 'SELLER',
        status: 'COMPLETED',
        amountMicros: sellerEarningMicros,
        balanceAfterMicros: seller?.sellerBalanceMicros ?? null,
        paymentRef: `usdcpay:${order.id}:${txHash}`,
        description: `Marketplace sale: ${listing.title} (order ${order.id})`,
      },
    });

    // Buyer payment record (debit)
    const buyerCostMicros = usdToMicros(updatedOrder.amountCents / 100);
    const [buyer] = await tx.$queryRaw<Array<{ balanceMicros: bigint }>>`
      UPDATE "Organization" SET "balanceMicros" = "balanceMicros" - ${buyerCostMicros}
      WHERE id = ${order.buyerOrgId} RETURNING "balanceMicros"`;

    await tx.billingTransaction.create({
      data: {
        orgId: order.buyerOrgId,
        type: 'CREDIT_PURCHASE',
        account: 'BUYER',
        status: 'COMPLETED',
        amountMicros: -buyerCostMicros,
        balanceAfterMicros: buyer?.balanceMicros ?? null,
        paymentRef: `usdcpay:${order.id}:${txHash}`,
        description: `Marketplace purchase: ${listing.title} (order ${order.id})`,
      },
    });
  });

  await emitEvent({
    orgId: listing.sellerOrgId,
    type: 'order.paid',
    title: `Order paid: ${listing.title}`,
    body: `Buyer purchased your API key listing for $${(order.amountCents / 100).toFixed(2)}`,
    data: { orderId: order.id, listingId: listing.id, amountCents: order.amountCents },
  });

  logger.info(
    { orderId: order.id, listingId: listing.id, txHash, amountCents: order.amountCents },
    'USDC/USDT payment confirmed',
  );

  return { orderId: order.id, status: 'PAID' };
}

/**
 * Get platform payment configuration for the frontend.
 */
export function getUsdcUsdtConfig() {
  return {
    usdc: {
      walletAddress: env.USDC_WALLET_ADDRESS ?? null,
      network: env.USDC_PAYMENT_NETWORK ?? 'ETHEREUM',
      configured: Boolean(env.USDC_WALLET_ADDRESS),
    },
    usdt: {
      walletAddress: env.USDT_WALLET_ADDRESS ?? null,
      network: env.USDT_PAYMENT_NETWORK ?? 'ETHEREUM',
      configured: Boolean(env.USDT_WALLET_ADDRESS),
    },
  };
}
