/**
 * Dodo Payments integration for crypto API key marketplace.
 *
 * Handles:
 *  - Creating checkout sessions for buyers to pay with crypto
 *  - Verifying Dodo webhooks (Standard Webhooks spec)
 *  - Mapping Dodo events to our Order/MerchantListing records
 *
 * Environment variables:
 *  - DODO_PAYMENTS_API_KEY   - Dodo API key (test or live)
 *  - DODO_PAYMENTS_WEBHOOK_KEY - Webhook signing secret (whsec_...)
 *  - DODO_PAYMENTS_BASE_URL  - https://test.dodopayments.com or https://live.dodopayments.com
 *  - APP_URL                 - Public URL of the web app (for success/cancel redirects)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { usdToMicros, microsToUsd } from '../lib/money.js';
import { encryptSecret, decryptSecret } from '../security/crypto.js';
import { logger } from '../lib/logger.js';
import { audit } from '../services/audit.js';
import { emitEvent } from '../services/events.js';
import { clientIp } from '../services/sessions.js';

const BASE_URL = env.DODO_PAYMENTS_BASE_URL ?? 'https://test.dodopayments.com';

export interface DodoCheckoutResult {
  checkoutId: string;
  checkoutUrl: string;
  orderId: string;
}

export interface DodoWebhookEvent {
  id: string;
  type: string;
  data: unknown;
  createdAt: string;
}

/**
 * Verify a Dodo Payments webhook signature (Standard Webhooks spec).
 * Signature is HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{rawBody}".
 */
export function verifyDodoSignature(
  rawBody: string,
  webhookId: string,
  timestamp: string,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!webhookId || !timestamp || !signatureHeader || !secret) return false;

  // Reject stale timestamps (>5 minutes tolerance) to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;

  const expected = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64'))
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest('base64');

  const valid = signatureHeader.split(' ').some((entry) => {
    const [version, received] = entry.split(',');
    if (version !== 'v1' || !received) return false;
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(received);
    if (receivedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(receivedBuf, expectedBuf);
  });

  return valid;
}

/**
 * Create a Dodo checkout session for a buyer purchasing a marketplace listing.
 */
export async function createDodoCheckout({
  listingId,
  buyerOrgId,
  idempotencyKey,
}: {
  listingId: string;
  buyerOrgId: string;
  idempotencyKey: string;
}): Promise<DodoCheckoutResult> {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: { sellerOrg: true },
  });
  if (!listing) throw new Error('Listing not found');
  if (listing.status !== 'ACTIVE') throw new Error('Listing is not active');
  if (listing.isSold && listing.maxBuyers !== null && listing.buyerCount >= listing.maxBuyers)
    throw new Error('Listing is sold out');

  const amountCents = listing.priceCents;
  const feeBps = env.PLATFORM_FEE_BPS;
  const platformFeeCents = Math.round((amountCents * feeBps) / 10_000);
  const sellerEarningCents = amountCents - platformFeeCents;

  // Create an order record first (pending)
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

  const successUrl = `${env.APP_URL}/marketplace/${listingId}/success?order_id=${order.id}`;
  const cancelUrl = `${env.APP_URL}/marketplace/${listingId}/cancel?order_id=${order.id}`;

  // Create the Dodo checkout session. Every failure path must roll the pending
  // order back: an orphaned PENDING row with no checkout id blocks the seller
  // from ever deleting this listing, even though the buyer was never handed a
  // URL to pay with.
  let data: { id: string; checkout_url: string; customer?: { id?: string } } | null = null;
  try {
    const resp = await fetch(`${BASE_URL}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        line_items: [
          {
            price: {
              unit_amount: amountCents,
              currency: listing.currency,
              product_data: {
                name: listing.title,
                description: listing.description ?? 'API key purchase from Nexovra marketplace',
                metadata: {
                  listing_id: listing.id,
                  order_id: order.id,
                  seller_org_id: listing.sellerOrgId,
                },
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: {
          metadata: {
            buyer_org_id: buyerOrgId,
            order_id: order.id,
          },
        },
        metadata: {
          listing_id: listing.id,
          order_id: order.id,
          seller_org_id: listing.sellerOrgId,
          buyer_org_id: buyerOrgId,
        },
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      logger.error({ status: resp.status, body: errorText }, 'dodo checkout creation failed');
      throw new Error(`Dodo checkout creation failed: ${resp.status}`);
    }

    data = (await resp.json()) as typeof data;
  } finally {
    if (!data) {
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    }
  }

  if (!data) throw new Error('Dodo checkout did not return a session');

  // Update order with Dodo checkout ID
  await prisma.order.update({
    where: { id: order.id },
    data: {
      dodoCheckoutId: data.id,
      dodoCustomerId: data.customer?.id ?? null,
    },
  });

  await audit({
    orgId: listing.sellerOrgId,
    actorUserId: undefined,
    action: 'marketplace.checkout.created',
    targetType: 'order',
    targetId: order.id,
    ip: 'system',
    metadata: { listingId, buyerOrgId, amountCents, dodoCheckoutId: data.id },
  });

  return {
    checkoutId: data.id,
    checkoutUrl: data.checkout_url,
    orderId: order.id,
  };
}

/**
 * Handle a Dodo webhook event. Returns true if the event was processed.
 * Caller must have already verified the signature.
 */
export async function handleDodoWebhook(event: DodoWebhookEvent): Promise<boolean> {
  const { id: webhookId, type, data } = event;

  // Idempotency: skip already-processed webhooks
  const existing = await prisma.billingTransaction.findFirst({
    where: { paymentRef: `dodo:${webhookId}` },
  });
  if (existing) return true;

  const payload = data as Record<string, unknown>;
  const paymentId = (payload.payment_id ?? payload.id) as string | undefined;

  switch (type) {
    case 'payment.succeeded': {
      const checkoutId = (payload.checkout_id ?? payload.checkoutId) as string | undefined;
      const customerId = (payload.customer_id ?? payload.customerId) as string | undefined;

      let order;
      if (checkoutId) {
        order = await prisma.order.findUnique({ where: { dodoCheckoutId: checkoutId } });
      } else if (paymentId) {
        order = await prisma.order.findFirst({ where: { dodoPaymentId: paymentId } });
      } else {
        logger.warn({ webhookId, type }, 'dodo payment.succeeded: no checkout/payment id found');
        return false;
      }

      if (!order) {
        logger.warn({ webhookId, type, checkoutId, paymentId }, 'dodo order not found');
        return false;
      }

      if (order.status === 'PAID') return true; // Already processed

      const listing = await prisma.marketplaceListing.findUnique({
        where: { id: order.listingId },
        include: { sellerOrg: true },
      });
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
            dodoPaymentId: paymentId ?? order.dodoPaymentId,
            dodoCustomerId: customerId ?? order.dodoCustomerId,
            apiKeyDelivered: decryptedKey ?? null,
            apiKeyDeliveredAt: decryptedKey ? new Date() : null,
            updatedAt: new Date(),
          },
        });

        // Credit the buyer's organization balance (optional: could also just deliver key)
        // Mark listing as sold if at max buyers
        const newBuyerCount = listing.buyerCount + 1;
        const isSoldOut =
          listing.maxBuyers !== null && newBuyerCount >= listing.maxBuyers;

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
            paymentRef: `dodo:${webhookId}:order:${order.id}`,
            description: `Marketplace sale: ${listing.title} (order ${order.id})`,
          },
        });

        // Buyer payment record
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
            paymentRef: `dodo:${webhookId}:order:${order.id}`,
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
        { orderId: order.id, listingId: listing.id, webhookId, amountCents: order.amountCents },
        'dodo payment succeeded',
      );
      return true;
    }

    case 'payment.failed': {
      const checkoutId = (payload.checkout_id ?? payload.checkoutId) as string | undefined;
      if (!checkoutId) return false;

      const order = await prisma.order.findUnique({ where: { dodoCheckoutId: checkoutId } });
      if (!order) return false;

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'FAILED', updatedAt: new Date() },
      });

      logger.info({ orderId: order.id, webhookId }, 'dodo payment failed');
      return true;
    }

    case 'payment.cancelled': {
      const checkoutId = (payload.checkout_id ?? payload.checkoutId) as string | undefined;
      if (!checkoutId) return false;

      const order = await prisma.order.findUnique({ where: { dodoCheckoutId: checkoutId } });
      if (!order) return false;

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', updatedAt: new Date() },
      });

      logger.info({ orderId: order.id, webhookId }, 'dodo payment cancelled');
      return true;
    }

    default:
      logger.info({ webhookId, type }, 'dodo webhook: unhandled event type');
      return true; // Acknowledge unhandled events
  }
}

/**
 * Create a Dodo product and price for a listing (called when listing is activated).
 * Returns the Dodo product ID and price ID.
 */
export async function createDodoProductAndPrice({
  listingId,
  title,
  description,
  amountCents,
}: {
  listingId: string;
  title: string;
  description: string | undefined;
  amountCents: number;
}): Promise<{ productId: string; priceId: string }> {
  // Create product
  const prodResp = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: title,
      description: description ?? 'API key listing on Nexovra marketplace',
      metadata: { listing_id: listingId },
    }),
  });
  if (!prodResp.ok) {
    const text = await prodResp.text();
    throw new Error(`Dodo product creation failed: ${prodResp.status} ${text}`);
  }
  const product = (await prodResp.json()) as { id: string };

  // Create price
  const priceResp = await fetch(`${BASE_URL}/prices`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product: product.id,
      unit_amount: amountCents,
      currency: 'usd',
      metadata: { listing_id: listingId },
    }),
  });
  if (!priceResp.ok) {
    const text = await priceResp.text();
    throw new Error(`Dodo price creation failed: ${priceResp.status} ${text}`);
  }
  const price = (await priceResp.json()) as { id: string };

  return { productId: product.id, priceId: price.id };
}

export function getDodoConfig() {
  return {
    baseUrl: BASE_URL,
    hasApiKey: Boolean(env.DODO_PAYMENTS_API_KEY),
    hasWebhookKey: Boolean(env.DODO_PAYMENTS_WEBHOOK_KEY),
  };
}
