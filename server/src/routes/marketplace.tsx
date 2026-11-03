/**
 * Marketplace routes for buying and selling API keys via Dodo Payments (crypto).
 *
 * Routes:
 *   GET    /api/marketplace/listings          - Browse active listings (public)
 *   GET    /api/marketplace/listings/:id      - Get a listing (public)
 *   POST   /api/marketplace/listings          - Create a listing (seller)
 *   PATCH  /api/marketplace/listings/:id      - Update a listing (seller)
 *   DELETE /api/marketplace/listings/:id      - Archive a listing (seller)
 *   POST   /api/marketplace/checkout          - Create Dodo checkout session (buyer)
 *   GET    /api/marketplace/orders            - Buyer's orders (authenticated)
 *   GET    /api/marketplace/orders/:id/api-key - Reveal purchased key (buyer, PAID only)
 *   GET    /api/marketplace/my-listings       - Seller's listings (authenticated)
 *   GET    /api/marketplace/my-listings/:id   - One listing, owner only (authenticated)
 *   GET    /api/marketplace/payout-account    - Seller's crypto wallet (authenticated)
 *   POST   /api/marketplace/payout-account    - Set seller's crypto wallet (authenticated)
 *   GET    /api/marketplace/seller-orders     - Seller's orders (authenticated)
 *   GET    /api/marketplace/config            - Dodo config (public)
 *   POST   /api/marketplace/webhooks/dodo     - Dodo webhook (no auth, raw body)
 */

import { Router, type Request, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { PayoutNetwork } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { HttpError, badRequest, notFound, unauthorized } from '../lib/errors.js';
import { parse } from '../middleware/error.js';
import { requireOrg, requirePermission } from '../middleware/org.js';
import { rateLimit, userKey } from '../middleware/rateLimit.js';
import {
  createDodoCheckout,
  createDodoProductAndPrice,
  verifyDodoSignature,
  handleDodoWebhook,
  getDodoConfig,
  type DodoWebhookEvent,
} from '../services/dodoPayments.js';
import { encryptSecret } from '../security/crypto.js';
import { logger } from '../lib/logger.js';
import { audit } from '../services/audit.js';
import { emitEvent } from '../services/events.js';
import { clientIp } from '../services/sessions.js';

export const marketplaceRouter = Router();

// ───────────── Dodo Webhook Router (no auth, raw body for signature verification) ─────────────

export const dodoWebhookRouter = Router();

dodoWebhookRouter.post('/', async (req, res, next) => {
  try {
    const webhookId = req.get('webhook-id') ?? '';
    const timestamp = req.get('webhook-timestamp') ?? '';
    const signature = req.get('webhook-signature') ?? '';

    if (!verifyDodoSignature((req.body as Buffer).toString('utf8'), webhookId, timestamp, signature, env.DODO_PAYMENTS_WEBHOOK_KEY)) {
      return res.status(400).json({ error: { code: 'invalid_signature', message: 'Invalid Dodo webhook signature' } });
    }

    let event: DodoWebhookEvent;
    try {
      event = JSON.parse((req.body as Buffer).toString('utf8'));
    } catch {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Invalid webhook payload' } });
    }

    const processed = await handleDodoWebhook(event);
    return res.status(200).json({ received: true, processed });
  } catch (err) {
    next(err);
  }
});

// ───────────── Public: Browse listings ─────────────

const listQuery = z.object({
  search: z.string().max(100).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['price', 'newest', 'popular']).default('newest'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

marketplaceRouter.get('/listings', async (req, res) => {
  const q = parse(listQuery, req.query);
  const where: Record<string, unknown> = {
    status: 'ACTIVE',
    isSold: false,
  };

  if (q.search) {
    where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { description: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    (where as Record<string, unknown>).priceCents = {};
    if (q.minPrice !== undefined) (where as Record<string, { gte?: number; lte?: number }>).priceCents.gte = q.minPrice;
    if (q.maxPrice !== undefined) (where as Record<string, { gte?: number; lte?: number }>).priceCents.lte = q.maxPrice;
  }

  const orderBy: Record<string, string> = {};
  switch (q.sort) {
    case 'price': orderBy.priceCents = 'asc'; break;
    case 'newest': orderBy.createdAt = 'desc'; break;
    case 'popular': orderBy.buyerCount = 'desc'; break;
  }

  const [listings, total] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where,
      orderBy,
      take: q.limit + 1,
      cursor: q.cursor ? { id: q.cursor } : undefined,
      select: {
        id: true, title: true, description: true, priceCents: true, currency: true,
        apiKeyPrefix: true, models: true, buyerCount: true, maxBuyers: true,
        status: true, createdAt: true,
        sellerOrg: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.marketplaceListing.count({ where }),
  ]);

  const hasMore = listings.length > q.limit;
  const data = hasMore ? listings.slice(0, -1) : listings;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  res.json({
    data: data.map((l) => ({
      ...l,
      priceUsd: (l.priceCents / 100).toFixed(2),
      isSoldOut: l.maxBuyers !== null && l.buyerCount >= l.maxBuyers,
    })),
    total,
    nextCursor,
  });
});

marketplaceRouter.get('/listings/:id', async (req, res) => {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: String(req.params.id) },
    include: { sellerOrg: { select: { id: true, name: true, slug: true } } },
  });
  if (!listing) throw notFound('Listing not found');

  res.json({
    listing: {
      ...listing,
      priceUsd: (listing.priceCents / 100).toFixed(2),
      isSoldOut: listing.maxBuyers !== null && listing.buyerCount >= listing.maxBuyers,
      apiKeyEncrypted: undefined,
    },
  });
});

// ───────────── Dodo config for frontend (public) ─────────────

marketplaceRouter.get('/config', async (_req, res) => {
  res.json(getDodoConfig());
});

// ───────────── Auth + Org required middleware for all routes below ─────────────

marketplaceRouter.use(requireOrg());

// ───────────── Seller: Create/manage listings ─────────────

const listingSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  priceUsd: z.coerce.number().min(0.01).max(100_000),
  apiKey: z.string().min(1).max(2000),
  models: z.array(z.string().min(1).max(200)).default([]),
  maxBuyers: z.coerce.number().int().min(1).max(10_000).optional(),
});

marketplaceRouter.post('/listings', requirePermission('seller:manage'), async (req, res) => {
  const body = parse(listingSchema, req.body);
  const orgId = req.org!.id;

  const amountCents = Math.round(body.priceUsd * 100);
  // Masked hint only — never expose more than the last 4 characters.
  const apiKeyPrefix = body.apiKey.length > 8 ? `••••${body.apiKey.slice(-4)}` : '••••';

  let dodoProductId: string | undefined;
  let dodoPriceId: string | undefined;
  if (env.DODO_PAYMENTS_API_KEY) {
    try {
      const { productId, priceId } = await createDodoProductAndPrice({
        listingId: 'pending',
        title: body.title,
        description: body.description,
        amountCents,
      });
      dodoProductId = productId;
      dodoPriceId = priceId;
    } catch (err) {
      logger.error({ err }, 'failed to create Dodo product/price, listing created without Dodo integration');
    }
  }

  // The listing id must exist before we can encrypt, because the encryption
  // context (`listing:<id>`) is bound as AAD and is the same context the
  // webhook uses when delivering the key to a paying buyer. Encrypting with
  // any other context would make the key undecryptable at delivery time.
  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.marketplaceListing.create({
      data: {
        sellerOrgId: orgId,
        title: body.title,
        description: body.description,
        priceCents: amountCents,
        currency: 'usd',
        apiKeyEncrypted: '',
        apiKeyPrefix,
        models: body.models,
        status: 'ACTIVE',
        maxBuyers: body.maxBuyers ?? null,
        buyerCount: 0,
        dodoProductId,
        dodoPriceId,
      },
    });
    const encrypted = encryptSecret(body.apiKey, `listing:${created.id}`);
    return tx.marketplaceListing.update({
      where: { id: created.id },
      data: { apiKeyEncrypted: JSON.stringify(encrypted) },
    });
  });

  if (dodoProductId && env.DODO_PAYMENTS_API_KEY) {
    try {
      await fetch(`${env.DODO_PAYMENTS_BASE_URL ?? 'https://test.dodopayments.com'}/products/${dodoProductId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.DODO_PAYMENTS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ metadata: { listing_id: listing.id } }),
      }).catch(() => undefined);
    } catch {
      // Non-fatal
    }
  }

  await audit({
    orgId,
    actorUserId: req.auth!.user.id,
    action: 'marketplace.listing.created',
    targetType: 'listing',
    targetId: listing.id,
    ip: clientIp(req),
    metadata: { title: body.title, priceUsd: body.priceUsd },
  });

  await emitEvent({
    orgId,
    type: 'listing.created',
    title: 'Listing created',
    body: `Your API key listing "${body.title}" is now live on the marketplace`,
    data: { listingId: listing.id, priceUsd: body.priceUsd },
  });

  res.status(201).json({
    listing: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      priceUsd: (listing.priceCents / 100).toFixed(2),
      status: listing.status,
      apiKeyPrefix: listing.apiKeyPrefix,
      models: listing.models,
      createdAt: listing.createdAt,
    },
  });
});

const listingUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  priceUsd: z.coerce.number().min(0.01).max(100_000).optional(),
  apiKey: z.string().min(1).max(2000).optional(),
  models: z.array(z.string().min(1).max(200)).optional(),
  maxBuyers: z.coerce.number().int().min(1).max(10_000).nullish(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
});

async function ownedListing(req: Request, id: string) {
  const l = await prisma.marketplaceListing.findFirst({
    where: { id, sellerOrgId: req.org!.id },
  });
  if (!l) throw notFound('Listing not found');
  return l;
}

marketplaceRouter.patch('/listings/:id', requirePermission('seller:manage'), async (req, res) => {
  const body = parse(listingUpdateSchema, req.body);
  const listing = await ownedListing(req, String(req.params.id));

  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.priceUsd !== undefined) updateData.priceCents = Math.round(body.priceUsd * 100);
  if (body.models !== undefined) updateData.models = body.models;
  if (body.maxBuyers !== undefined) updateData.maxBuyers = body.maxBuyers;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.apiKey !== undefined) {
    const encrypted = encryptSecret(body.apiKey, `listing:${listing.id}`);
    updateData.apiKeyEncrypted = JSON.stringify(encrypted);
    updateData.apiKeyPrefix = body.apiKey.length > 8 ? `••••${body.apiKey.slice(-4)}` : '••••';
  }

  const updated = await prisma.marketplaceListing.update({
    where: { id: listing.id },
    data: updateData,
  });

  await audit({
    orgId: req.org!.id,
    actorUserId: req.auth!.user.id,
    action: 'marketplace.listing.updated',
    targetType: 'listing',
    targetId: listing.id,
    ip: clientIp(req),
    metadata: body as never,
  });

  res.json({
    listing: {
      id: updated.id,
      title: updated.title,
      priceUsd: (updated.priceCents / 100).toFixed(2),
      status: updated.status,
      apiKeyPrefix: updated.apiKeyPrefix,
    },
  });
});

marketplaceRouter.delete('/listings/:id', requirePermission('seller:manage'), async (req, res) => {
  const listing = await ownedListing(req, String(req.params.id));

  const pendingOrders = await prisma.order.count({
    where: { listingId: listing.id, status: 'PENDING' },
  });
  if (pendingOrders > 0) {
    throw badRequest('Cannot archive listing with pending orders', undefined, 'pending_orders');
  }

  await prisma.marketplaceListing.update({
    where: { id: listing.id },
    data: { status: 'ARCHIVED', isSold: true },
  });

  await audit({
    orgId: req.org!.id,
    actorUserId: req.auth!.user.id,
    action: 'marketplace.listing.archived',
    targetType: 'listing',
    targetId: listing.id,
    ip: clientIp(req),
  });

  res.json({ ok: true });
});

// ───────────── Buyer: Checkout ─────────────

const checkoutSchema = z.object({
  listingId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(200),
});

marketplaceRouter.post(
  '/checkout',
  requirePermission('inference:use'),
  rateLimit({ name: 'checkout', windowSeconds: 60, max: 10, key: userKey }),
  async (req, res) => {
    const body = parse(checkoutSchema, req.body);

    if (!env.DODO_PAYMENTS_API_KEY) {
      throw new HttpError(503, 'payment_not_configured', 'Payment gateway is not configured on this server.');
    }

    // Dodo failures (bad/expired API key, gateway down) must surface as a
    // clean 502 the client can show, never an unhandled 500.
    let result;
    try {
      result = await createDodoCheckout({
        listingId: body.listingId,
        buyerOrgId: req.org!.id,
        idempotencyKey: body.idempotencyKey,
      });
    } catch {
      throw new HttpError(
        502,
        'payment_gateway_error',
        'The payment gateway rejected this checkout. Check the DODO_PAYMENTS_API_KEY configured on the server.',
      );
    }

    res.status(201).json({
      checkoutId: result.checkoutId,
      checkoutUrl: result.checkoutUrl,
      orderId: result.orderId,
    });
  },
);

// ───────────── Buyer/Seller: Orders ─────────────

marketplaceRouter.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { buyerOrgId: req.org!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      listing: {
        select: { id: true, title: true, priceCents: true, currency: true, apiKeyPrefix: true },
      },
    },
  });
  res.json({
    data: orders.map((o) => ({
      id: o.id,
      listingTitle: o.listing.title,
      listingPrefix: o.listing.apiKeyPrefix,
      amountUsd: (o.amountCents / 100).toFixed(2),
      status: o.status,
      apiKeyDelivered: o.apiKeyDelivered ? 'delivered' : null,
      apiKeyDeliveredAt: o.apiKeyDeliveredAt,
      cryptoTxHash: o.cryptoTxHash,
      createdAt: o.createdAt,
    })),
  });
});

// ───────────── Buyer: Reveal purchased API key (only after payment) ─────────────
// The key is never returned by any public or listing endpoint. It is only
// released here, to the buyer org that owns a PAID order.

marketplaceRouter.get('/orders/:id/api-key', async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: String(req.params.id), buyerOrgId: req.org!.id },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          apiKeyPrefix: true,
          sellerOrg: { select: { name: true } },
        },
      },
    },
  });
  if (!order) throw notFound('Order not found');
  if (order.status !== 'PAID') {
    throw badRequest('API key is only available after payment succeeds');
  }
  if (!order.apiKeyDelivered) {
    throw badRequest('API key has not been delivered for this order yet');
  }

  res.json({
    orderId: order.id,
    listingId: order.listing.id,
    listingTitle: order.listing.title,
    seller: order.listing.sellerOrg.name,
    apiKeyPrefix: order.listing.apiKeyPrefix,
    apiKey: order.apiKeyDelivered,
    deliveredAt: order.apiKeyDeliveredAt,
  });
});

// ───────────── Seller: My listings ─────────────

marketplaceRouter.get('/my-listings', async (req, res) => {
  const listings = await prisma.marketplaceListing.findMany({
    where: { sellerOrgId: req.org!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      _count: { select: { orders: true } },
    },
  });
  res.json({
    data: listings.map((l) => ({
      id: l.id,
      title: l.title,
      priceUsd: (l.priceCents / 100).toFixed(2),
      status: l.status,
      isSold: l.isSold,
      buyerCount: l.buyerCount,
      maxBuyers: l.maxBuyers,
      orderCount: l._count.orders,
      createdAt: l.createdAt,
    })),
  });
});

// Owner-only detail for the manage page. Returns everything the seller may
// see (including description/models/orderCount) but never the ciphertext —
// and 404s for listings belonging to another org.
marketplaceRouter.get('/my-listings/:id', async (req, res) => {
  const listing = await prisma.marketplaceListing.findFirst({
    where: { id: String(req.params.id), sellerOrgId: req.org!.id },
    include: { _count: { select: { orders: true } } },
  });
  if (!listing) throw notFound('Listing not found');

  const { _count, ...rest } = listing;
  res.json({
    listing: {
      ...rest,
      priceUsd: (listing.priceCents / 100).toFixed(2),
      apiKeyEncrypted: undefined,
      orderCount: _count.orders,
      isSoldOut: listing.maxBuyers !== null && listing.buyerCount >= listing.maxBuyers,
    },
  });
});

// ───────────── Seller: Crypto payout account ─────────────

const payoutAccountSchema = z.object({
  walletAddress: z.string().trim().min(1).max(100),
  network: z.nativeEnum(PayoutNetwork).default(PayoutNetwork.ETHEREUM),
});

marketplaceRouter.get('/payout-account', async (req, res) => {
  const account = await prisma.cryptoPayoutAccount.findUnique({
    where: { orgId: req.org!.id },
  });
  res.json({ account: account ? { ...account, walletAddress: `••••${account.walletAddress.slice(-4)}` } : null });
});

marketplaceRouter.post('/payout-account', async (req, res) => {
  const body = parse(payoutAccountSchema, req.body);

  const account = await prisma.cryptoPayoutAccount.upsert({
    where: { orgId: req.org!.id },
    update: { walletAddress: body.walletAddress, network: body.network, isVerified: false },
    create: { orgId: req.org!.id, walletAddress: body.walletAddress, network: body.network },
  });

  await audit({
    orgId: req.org!.id,
    actorUserId: req.auth!.user.id,
    action: 'marketplace.payout_account.updated',
    targetType: 'payout_account',
    targetId: account.id,
    ip: clientIp(req),
    metadata: { network: body.network },
  });

  res.json({ account: { ...account, walletAddress: `••••${account.walletAddress.slice(-4)}` } });
});

// ───────────── Seller: Orders of their listings ─────────────

marketplaceRouter.get('/seller-orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { listing: { sellerOrgId: req.org!.id } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      listing: { select: { id: true, title: true } },
      buyerOrg: { select: { id: true, name: true, slug: true } },
    },
  });
  res.json({
    data: orders.map((o) => ({
      id: o.id,
      listingId: o.listing.id,
      listingTitle: o.listing.title,
      buyerOrg: o.buyerOrg.name,
      amountUsd: (o.amountCents / 100).toFixed(2),
      sellerEarningUsd: (o.sellerEarningCents / 100).toFixed(2),
      status: o.status,
      apiKeyDelivered: o.apiKeyDelivered ? 'delivered' : null,
      createdAt: o.createdAt,
    })),
  });
});

// ───────────── End of marketplace routes ─────────────
