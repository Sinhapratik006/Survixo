/**
 * Marketplace routes for buying and selling API keys via direct USDC/USDT payments.
 *
 * Routes:
 *   GET    /api/marketplace/listings          - Browse active listings (public)
 *   GET    /api/marketplace/listings/:id      - Get a listing (public)
 *   POST   /api/marketplace/listings          - Create a listing (seller)
 *   PATCH  /api/marketplace/listings/:id      - Update a listing (seller)
 *   DELETE /api/marketplace/listings/:id      - Archive a listing (seller)
 *   POST   /api/marketplace/verify-key        - Probe an API key's health (seller)
 *   POST   /api/marketplace/payment           - Create USDC/USDT payment details (buyer)
 *   POST   /api/marketplace/payment/confirm   - Confirm payment with tx hash (buyer/ops)
 *   GET    /api/marketplace/orders            - Buyer's orders (authenticated)
 *   GET    /api/marketplace/orders/:id/api-key - Reveal purchased key (buyer, PAID only)
 *   GET    /api/marketplace/my-listings       - Seller's listings (authenticated)
 *   GET    /api/marketplace/my-listings/:id   - One listing, owner only (authenticated)
 *   GET    /api/marketplace/payout-account    - Seller's crypto wallet (authenticated)
 *   POST   /api/marketplace/payout-account    - Set seller's crypto wallet (authenticated)
 *   GET    /api/marketplace/seller-orders     - Seller's orders (authenticated)
 *   GET    /api/marketplace/payment-config    - USDC/USDT payment config (public)
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
  createUsdcUsdtPayment,
  confirmUsdcUsdtPayment,
  getUsdcUsdtConfig,
  type PaymentDetails,
} from '../services/usdcUsdtPayments.js';
import { encryptSecret } from '../security/crypto.js';
import { logger } from '../lib/logger.js';
import { audit } from '../services/audit.js';
import { emitEvent } from '../services/events.js';
import { clientIp } from '../services/sessions.js';
import { buyerPriceCents, creditValueCentsFromPrice } from '../lib/pricing.js';
import { microsToUsd } from '../lib/money.js';
import { checkListingKey } from '../services/listingKeyHealth.js';

export const marketplaceRouter = Router();

/** Face value of the credits a listing represents, as a USD string. */
function creditValueUsd(priceCents: number): string {
  return (creditValueCentsFromPrice(priceCents) / 100).toFixed(2);
}

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

  const sellerNames = new Map(
    listings.map((l) => [l.id, l.sellerOrg?.name || 'Unknown'])
  );

  const hasMore = listings.length > q.limit;
  const data = hasMore ? listings.slice(0, -1) : listings;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  res.json({
    data: data.map((l) => ({
      ...l,
      priceUsd: (l.priceCents / 100).toFixed(2),
      creditValueUsd: creditValueUsd(l.priceCents),
      isSoldOut: l.maxBuyers !== null && l.buyerCount >= l.maxBuyers,
      sellerName: sellerNames.get(l.id) || 'Unknown',
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
      creditValueUsd: creditValueUsd(listing.priceCents),
      isSoldOut: listing.maxBuyers !== null && listing.buyerCount >= listing.maxBuyers,
      apiKeyEncrypted: undefined,
    },
  });
});

// ───────────── USDC/USDT payment config for frontend (public) ─────────────

marketplaceRouter.get('/payment-config', async (_req, res) => {
  res.json(getUsdcUsdtConfig());
});

// ───────────── Auth + Org required middleware for all routes below ─────────────

marketplaceRouter.use(requireOrg());

// ───────────── Seller: Create/manage listings ─────────────

/**
 * A listing is priced from the face value of the API credits being sold:
 * the platform buys at 32% of that value and lists at 76% (see lib/pricing).
 * `priceUsd` is accepted as a legacy alias for `creditValueUsd`.
 */
const creditValueField = z.coerce.number().min(0.01).max(100_000);

/**
 * Sellers type base URLs in every shape: full addresses, bare hosts copied
 * from provider docs (`api.openai.com/v1`), protocol-relative `//host`, and
 * wrapped pastes with stray whitespace. Normalise first so a usable value is
 * never bounced back as a validation error; only genuinely unusable input
 * fails validation.
 */
function normalizeBaseUrl(raw: string): string {
  // Line breaks/tabs come from wrapped pastes and are never valid in a URL;
  // other inner whitespace is kept so "not a url" still fails validation.
  const v = raw.replace(/[\t\r\n]+/g, '').trim();
  if (!v) return v;
  // An explicit scheme is kept exactly as typed (validated below).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  const bare = v.replace(/^\/+/, '');
  // Local targets are http in dev setups; anything else defaults to https.
  const loopback = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(bare);
  return `${loopback ? 'http://' : 'https://'}${bare}`;
}

export const optionalBaseUrl = z.preprocess(
  (v) => (typeof v === 'string' ? normalizeBaseUrl(v) : v),
  z
    .string()
    .max(300)
    .refine(
      (v) => {
        if (v === '') return true;
        try {
          const u = new URL(v);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'Use a valid http:// or https:// URL, e.g. api.openai.com/v1' },
    )
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, '') : undefined)),
);

const listingSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    creditValueUsd: creditValueField.optional(),
    priceUsd: creditValueField.optional(),
    apiKey: z.string().min(1).max(2000),
    baseUrl: optionalBaseUrl,
    models: z.array(z.string().min(1).max(200)).default([]),
    maxBuyers: z.coerce.number().int().min(1).max(10_000).optional(),
  })
  .refine((v) => v.creditValueUsd !== undefined || v.priceUsd !== undefined, {
    message: 'Credit value is required',
    path: ['creditValueUsd'],
  });

// ───────────── Seller: Verify an API key's health (used by the listing forms) ─────────────

const verifyKeySchema = z.object({
  apiKey: z.string().min(1).max(2000),
  baseUrl: optionalBaseUrl,
  models: z.array(z.string().min(1).max(200)).optional(),
});

marketplaceRouter.post(
  '/verify-key',
  requirePermission('seller:manage'),
  rateLimit({ name: 'key-verify', windowSeconds: 60, max: 15, key: userKey }),
  async (req, res) => {
    const body = parse(verifyKeySchema, req.body);
    res.json(await checkListingKey({ apiKey: body.apiKey, baseUrl: body.baseUrl, models: body.models }));
  },
);

marketplaceRouter.post('/listings', requirePermission('seller:manage'), async (req, res) => {
  const body = parse(listingSchema, req.body);
  const orgId = req.org!.id;

  const creditCents = Math.round((body.creditValueUsd ?? body.priceUsd!) * 100);
  // What buyers pay: 76% of the credits' face value.
  const amountCents = buyerPriceCents(creditCents);

  // Gate on key health first — a listing is only as good as the credential
  // behind it, and nothing else downstream ever re-checks it.
  const health = await checkListingKey({ apiKey: body.apiKey, baseUrl: body.baseUrl, models: body.models });
  if (!health.ok) throw badRequest(health.detail, undefined, 'invalid_api_key');

  // Masked hint only — never expose more than the last 4 characters.
  const apiKeyPrefix = body.apiKey.length > 8 ? `••••${body.apiKey.slice(-4)}` : '••••';

  // The listing id must exist before we can encrypt, because the encryption
  // context (`listing:<id>`) is bound as AAD and is the same context the
  // payment confirmation uses when delivering the key to a paying buyer.
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
      },
    });
    const encrypted = encryptSecret(body.apiKey, `listing:${created.id}`);
    return tx.marketplaceListing.update({
      where: { id: created.id },
      data: { apiKeyEncrypted: JSON.stringify(encrypted) },
    });
  });

  await audit({
    orgId,
    actorUserId: req.auth!.user.id,
    action: 'marketplace.listing.created',
    targetType: 'listing',
    targetId: listing.id,
    ip: clientIp(req),
    metadata: { title: body.title, creditValueUsd: creditValueUsd(amountCents), priceUsd: (amountCents / 100).toFixed(2) },
  });

  await emitEvent({
    orgId,
    type: 'listing.created',
    title: 'Listing created',
    body: `Your API key listing "${body.title}" is now live on the marketplace`,
    data: { listingId: listing.id, priceUsd: (amountCents / 100).toFixed(2) },
  });

  res.status(201).json({
    listing: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      priceUsd: (listing.priceCents / 100).toFixed(2),
      creditValueUsd: creditValueUsd(listing.priceCents),
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
  creditValueUsd: creditValueField.optional(),
  priceUsd: creditValueField.optional(),
  apiKey: z.string().min(1).max(2000).optional(),
  baseUrl: optionalBaseUrl,
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

  // A rotated key must pass the same health gate as a brand-new listing,
  // otherwise a seller could swap in garbage after the fact.
  if (body.apiKey !== undefined) {
    const health = await checkListingKey({
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      models: body.models ?? listing.models,
    });
    if (!health.ok) throw badRequest(health.detail, undefined, 'invalid_api_key');
  }

  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  const newCreditValueUsd = body.creditValueUsd ?? body.priceUsd;
  if (newCreditValueUsd !== undefined) updateData.priceCents = buyerPriceCents(Math.round(newCreditValueUsd * 100));
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
      creditValueUsd: creditValueUsd(updated.priceCents),
      status: updated.status,
      apiKeyPrefix: updated.apiKeyPrefix,
    },
  });
});

marketplaceRouter.delete('/listings/:id', requirePermission('seller:manage'), async (req, res) => {
  const listing = await ownedListing(req, String(req.params.id));

  // Only a checkout the buyer is actively inside protects them. If we deleted
  // the listing now, a payment could still come in and we'd have no listing
  // to deliver a key from — paid-but-delivered-nothing.
  //
  // Failed attempts (no payment tx hash was ever provided) and checkouts
  // abandoned past the grace window must NOT block: nothing ever expires a
  // PENDING order, so otherwise a single aborted attempt would make the listing
  // permanently undeletable.
  const CHECKOUT_GRACE_MS = 60 * 60 * 1000;
  const inFlight = await prisma.order.count({
    where: {
      listingId: listing.id,
      status: 'PENDING',
      paymentTxHash: { not: null },
      createdAt: { gte: new Date(Date.now() - CHECKOUT_GRACE_MS) },
    },
  });
  if (inFlight > 0) {
    throw badRequest(
      'A buyer is part-way through checkout on this listing. Give it a few minutes to complete or expire, then try again.',
      undefined,
      'pending_orders',
    );
  }

  // Everything else still PENDING is abandoned or was a failed attempt. Cancel
  // it explicitly rather than letting the FK cascade quietly remove the row.
  await prisma.order.updateMany({
    where: { listingId: listing.id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });

  // Only real money survives as a reason to keep the row: buyers hold delivered
  // keys and the payout/fee records must stay. Cancelled/failed attempts don't.
  const paidOrders = await prisma.order.count({
    where: { listingId: listing.id, status: { in: ['PAID', 'REFUNDED'] } },
  });

  if (paidOrders > 0) {
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
      metadata: { orderCount: paidOrders },
    });

    return res.json({ ok: true, deleted: false, archived: true, orderCount: paidOrders });
  }

  // No paid orders — remove it for real so it leaves the dashboard.
  await prisma.marketplaceListing.delete({ where: { id: listing.id } });

  await audit({
    orgId: req.org!.id,
    actorUserId: req.auth!.user.id,
    action: 'marketplace.listing.deleted',
    targetType: 'listing',
    targetId: listing.id,
    ip: clientIp(req),
  });

  res.json({ ok: true, deleted: true, archived: false, orderCount: 0 });
});

// ───────────── Buyer: Create USDC/USDT payment ─────────────

const paymentSchema = z.object({
  listingId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(200),
  token: z.enum(['USDC', 'USDT']).default('USDC'),
});

marketplaceRouter.post(
  '/payment',
  requirePermission('inference:use'),
  rateLimit({ name: 'checkout', windowSeconds: 60, max: 10, key: userKey }),
  async (req, res) => {
    const body = parse(paymentSchema, req.body);

    const walletAddress =
      body.token === 'USDC' ? env.USDC_WALLET_ADDRESS : env.USDT_WALLET_ADDRESS;
    if (!walletAddress) {
      throw new HttpError(
        503,
        'payment_not_configured',
        `Payment wallet address for ${body.token} is not configured on this server.`,
      );
    }

    let result: PaymentDetails;
    try {
      result = await createUsdcUsdtPayment({
        listingId: body.listingId,
        buyerOrgId: req.org!.id,
        idempotencyKey: body.idempotencyKey,
      });
    } catch {
      throw new HttpError(
        502,
        'payment_gateway_error',
        'Failed to create payment details. Check the USDC/USDT wallet configuration on the server.',
      );
    }

    res.status(201).json({
      orderId: result.orderId,
      paymentReference: result.paymentReference,
      walletAddress: result.walletAddress,
      token: result.token,
      network: result.network,
      amountUsd: result.amountUsd,
      amountCents: result.amountCents,
      expiresAt: result.expiresAt,
    });
  },
);

// ───────────── Buyer/Ops: Confirm USDC/USDT payment ─────────────

const confirmPaymentSchema = z.object({
  orderId: z.string().min(1),
  txHash: z.string().trim().min(1).max(128),
});

marketplaceRouter.post(
  '/payment/confirm',
  requirePermission('inference:use'),
  rateLimit({ name: 'payment-confirm', windowSeconds: 60, max: 20, key: userKey }),
  async (req, res) => {
    const body = parse(confirmPaymentSchema, req.body);

    const { orderId, status } = await confirmUsdcUsdtPayment({
      orderId: body.orderId,
      txHash: body.txHash,
    });

    res.json({ orderId, status });
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
      paymentToken: o.paymentToken,
      paymentNetwork: o.paymentNetwork,
      paymentTxHash: o.paymentTxHash,
      paymentConfirmed: o.paymentConfirmed,
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
      sellerOrg: { select: { id: true, name: true, slug: true } },
    },
  });
  res.json({
    data: listings.map((l) => ({
      id: l.id,
      title: l.title,
      priceUsd: (l.priceCents / 100).toFixed(2),
      creditValueUsd: creditValueUsd(l.priceCents),
      status: l.status,
      isSold: l.isSold,
      buyerCount: l.buyerCount,
      maxBuyers: l.maxBuyers,
      orderCount: l._count.orders,
      createdAt: l.createdAt,
      sellerName: l.sellerOrg?.name || 'Unknown',
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
      creditValueUsd: creditValueUsd(listing.priceCents),
      apiKeyEncrypted: undefined,
      orderCount: _count.orders,
      isSoldOut: listing.maxBuyers !== null && listing.buyerCount >= listing.maxBuyers,
    },
  });
});

// ───────────── Seller: Payout summary ─────────────

export const MIN_PAYOUT_USD = 25;

/** Date of the next weekly settlement run (every Friday, UTC). */
function nextWeeklyPayoutDate(): Date {
  const now = new Date();
  const daysUntilFriday = (5 - now.getUTCDay() + 7) % 7;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilFriday));
  return next;
}

marketplaceRouter.get('/payout-summary', async (req, res) => {
  const orgId = req.org!.id;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [org, pending, paid, last7] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { sellerBalanceMicros: true },
    }),
    prisma.payout.aggregate({
      where: { orgId, status: { in: ['REQUESTED', 'PROCESSING'] } },
      _sum: { amountMicros: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { listing: { sellerOrgId: orgId }, status: 'PAID' },
      _sum: { sellerEarningCents: true, amountCents: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { listing: { sellerOrgId: orgId }, status: 'PAID', createdAt: { gte: sevenDaysAgo } },
      _sum: { sellerEarningCents: true },
      _count: { _all: true },
    }),
  ]);

  res.json({
    availableBalanceUsd: microsToUsd(org.sellerBalanceMicros),
    pendingPayoutUsd: microsToUsd(pending._sum.amountMicros),
    pendingPayoutCount: pending._count._all,
    lifetimeEarningsUsd: (paid._sum.sellerEarningCents ?? 0) / 100,
    grossSalesUsd: (paid._sum.amountCents ?? 0) / 100,
    paidSalesCount: paid._count._all,
    last7DaysEarningsUsd: (last7._sum.sellerEarningCents ?? 0) / 100,
    last7DaysSalesCount: last7._count._all,
    minPayoutUsd: MIN_PAYOUT_USD,
    schedule: 'weekly',
    payoutDay: 'Friday',
    nextPayoutDate: nextWeeklyPayoutDate().toISOString(),
    // No automated on-chain disbursement provider is wired up yet: payouts are
    // recorded and funds reserved, then settled manually in the weekly batch.
    payoutProviderConfigured: false,
  });
});

// ───────────── Seller: Crypto payout account ─────────────

// Per-network address format checks. These validate shape only — ownership is
// proven during the manual ops review before a verified payout account is
// allowed to receive funds, so accepting a well-formed-but-wrong address is
// caught downstream rather than silently paid.
const WALLET_PATTERNS = {
  [PayoutNetwork.ETHEREUM]: /^0x[a-fA-F0-9]{40}$/,
  [PayoutNetwork.POLYGON]: /^0x[a-fA-F0-9]{40}$/,
  [PayoutNetwork.ARBITRUM]: /^0x[a-fA-F0-9]{40}$/,
  [PayoutNetwork.SOLANA]: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  [PayoutNetwork.BITCOIN]: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
} as const satisfies Record<PayoutNetwork, RegExp>;

const payoutAccountSchema = z
  .object({
    walletAddress: z.string().trim().min(8).max(100),
    network: z.nativeEnum(PayoutNetwork).default(PayoutNetwork.ETHEREUM),
  })
  .superRefine((value, ctx) => {
    const pattern = WALLET_PATTERNS[value.network];
    if (!pattern.test(value.walletAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['walletAddress'],
        message: `That doesn't look like a valid ${value.network} wallet address`,
      });
    }
  });

marketplaceRouter.get('/payout-account', async (req, res) => {
  const account = await prisma.cryptoPayoutAccount.findUnique({
    where: { orgId: req.org!.id },
  });
  res.json({ account: account ? { ...account, walletAddress: `••••${account.walletAddress.slice(-4)}` } : null });
});

marketplaceRouter.post('/payout-account', async (req, res) => {
  const body = parse(payoutAccountSchema, req.body);

  const user = req.auth?.user;
  const account = await prisma.cryptoPayoutAccount.upsert({
    where: { orgId: req.org!.id },
    update: {
      walletAddress: body.walletAddress,
      network: body.network,
      isVerified: false,
      userId: user?.id,
      name: user?.name,
      email: user?.email,
    },
    create: {
      orgId: req.org!.id,
      walletAddress: body.walletAddress,
      network: body.network,
      userId: user?.id,
      name: user?.name,
      email: user?.email,
    },
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
      paymentToken: o.paymentToken,
      paymentNetwork: o.paymentNetwork,
      paymentTxHash: o.paymentTxHash,
      paymentConfirmed: o.paymentConfirmed,
      createdAt: o.createdAt,
    })),
  });
});

// ───────────── End of marketplace routes ─────────────
