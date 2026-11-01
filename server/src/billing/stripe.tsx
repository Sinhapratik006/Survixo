import { env } from '../config/env.js';
import { hmacHex, safeEqual } from '../security/crypto.js';
import { creditBalance } from './ledger.js';
import { logger } from '../lib/logger.js';

/**
 * Minimal Stripe Checkout integration over the REST API (no SDK).
 * Payment confirmation comes ONLY from a signature-verified webhook
 * (`checkout.session.completed` with payment_status=paid); the redirect back
 * from Checkout never credits an account.
 */
export async function createCheckoutSession(input: { orgId: string; amountCents: number; email: string; userId: string }): Promise<{ url: string; id: string }> {
  if (env.BILLING_MODE !== 'stripe' || !env.STRIPE_SECRET_KEY) throw new Error('Stripe billing is not configured');
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(input.amountCents),
    'line_items[0][price_data][product_data][name]': 'Nexovra prepaid inference credit',
    client_reference_id: input.orgId,
    customer_email: input.email,
    'metadata[orgId]': input.orgId,
    'metadata[userId]': input.userId,
    success_url: `${env.APP_URL}/dashboard/billing?checkout=success`,
    cancel_url: `${env.APP_URL}/dashboard/billing?checkout=cancelled`,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !body.url || !body.id) {
    logger.error({ status: res.status, message: body.error?.message }, 'stripe checkout creation failed');
    throw new Error('Could not start checkout');
  }
  return { url: body.url, id: body.id };
}

/** Verify a `Stripe-Signature` header (t=...,v1=...) against the raw request body. */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = Number(v);
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = hmacHex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(s, expected));
}

export async function handleStripeEvent(event: { id: string; type: string; data: { object: Record<string, unknown> } }): Promise<void> {
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return;
  const session = event.data.object as { id: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { orgId?: string } };
  if (session.payment_status !== 'paid' || session.currency !== 'usd' || !session.metadata?.orgId || !session.amount_total) return;
  await creditBalance({
    orgId: session.metadata.orgId,
    amountMicros: BigInt(session.amount_total) * 10_000n,
    type: 'CREDIT_PURCHASE',
    paymentRef: `stripe:${session.id}`,
    description: `Card top-up via Stripe ($${(session.amount_total / 100).toFixed(2)})`,
  });
}
