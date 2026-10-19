import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { validateOffer, verifyEndpoint } from '../../src/services/offerValidation.js';
import { seedCatalog } from '../../src/scripts/seedData.js';
import { creditBalance } from '../../src/billing/ledger.js';

export const ORIGIN = 'http://localhost:5173';
let app: Express | undefined;
export function getApp() {
  app ??= createApp();
  return app;
}

export async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

/** A signed-in browser-like client: cookie jar + CSRF header + same-origin Origin. */
export interface Client {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  email: string;
  orgId: string;
  get: (path: string, orgId?: string) => request.Test;
  post: (path: string, body?: object, orgId?: string) => request.Test;
  put: (path: string, body?: object, orgId?: string) => request.Test;
  patch: (path: string, body?: object, orgId?: string) => request.Test;
  del: (path: string, body?: object, orgId?: string) => request.Test;
}

export function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const found = raw?.find((c) => c.startsWith(`${name}=`));
  return found?.split(';')[0]!.slice(name.length + 1);
}

export async function signUp(email = `user${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`, password = 'correct-horse-battery'): Promise<Client> {
  const agent = request.agent(getApp());
  const res = await agent.post('/api/auth/signup').set('origin', ORIGIN).send({ email, password, name: 'Test User' });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return clientFor(agent, cookieValue(res, 'nx_csrf')!, email);
}

export async function clientFor(agent: ReturnType<typeof request.agent>, csrf: string, email: string): Promise<Client> {
  const me = await agent.get('/api/auth/me');
  const orgId = me.body.memberships[0].id as string;
  const withHeaders = (t: request.Test, org?: string) => {
    t.set('origin', ORIGIN).set('x-csrf-token', csrf);
    if (org) t.set('x-org-id', org);
    return t;
  };
  return {
    agent,
    csrf,
    email,
    orgId,
    get: (p, org) => withHeaders(agent.get(p), org),
    post: (p, b = {}, org) => withHeaders(agent.post(p), org).send(b),
    put: (p, b = {}, org) => withHeaders(agent.put(p), org).send(b),
    patch: (p, b = {}, org) => withHeaders(agent.patch(p), org).send(b),
    del: (p, b, org) => withHeaders(agent.delete(p), org).send(b ?? {}),
  };
}

export async function createApiKey(client: Client, body: object = { name: 'test key' }, orgId?: string): Promise<{ id: string; secret: string }> {
  const res = await client.post('/api/api-keys', body, orgId);
  if (res.status !== 201) throw new Error(`key creation failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.key.id, secret: res.body.secret };
}

export function v1(secret: string) {
  const app = getApp();
  return {
    get: (p: string) => request(app).get(p).set('authorization', `Bearer ${secret}`),
    post: (p: string, body: object, headers: Record<string, string> = {}) => {
      const t = request(app).post(p).set('authorization', `Bearer ${secret}`);
      for (const [k, v] of Object.entries(headers)) t.set(k, v);
      return t.send(body);
    },
  };
}

export async function seedModels() {
  const quiet = console.log;
  console.log = () => {};
  try {
    await seedCatalog();
  } finally {
    console.log = quiet;
  }
}

/**
 * Create a seller org with a demo endpoint (deterministic config) and validated,
 * active offers for the given models.
 */
export async function createDemoSeller(opts: {
  slug: string;
  models: string[];
  inputPriceUsd: number;
  outputPriceUsd: number;
  failureRate?: number;
}) {
  const org = await prisma.organization.create({ data: { name: `Seller ${opts.slug}`, slug: opts.slug, isDemo: true } });
  const endpoint = await prisma.sellerEndpoint.create({
    data: {
      orgId: org.id,
      name: `${opts.slug} endpoint`,
      adapter: 'demo',
      baseUrl: 'demo://synthetic',
      config: { models: opts.models, latencyMs: [2, 6], failureRate: opts.failureRate ?? 0, arithmeticAccuracy: 1 },
    },
  });
  await verifyEndpoint(endpoint.id);
  const offers = [];
  for (const modelId of opts.models) {
    const offer = await prisma.offer.create({
      data: {
        sellerOrgId: org.id,
        endpointId: endpoint.id,
        modelId,
        upstreamModel: modelId,
        inputPrice: Math.round(opts.inputPriceUsd * 1e6),
        outputPrice: Math.round(opts.outputPriceUsd * 1e6),
        isDemo: true,
        timeoutMs: 5000,
      },
    });
    // Validation runs with failureRate 0 so that "always failing" sellers can still be listed for failover tests.
    const cfg = await prisma.sellerEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    await prisma.sellerEndpoint.update({ where: { id: endpoint.id }, data: { config: { ...(cfg.config as object), failureRate: 0 } } });
    const v = await validateOffer(offer.id);
    if (!v.ok) throw new Error(`validation failed: ${JSON.stringify(v.steps)}`);
    await prisma.sellerEndpoint.update({ where: { id: endpoint.id }, data: { config: cfg.config as object } });
    offers.push(await prisma.offer.update({ where: { id: offer.id }, data: { status: 'ACTIVE' } }));
  }
  return { org, endpoint, offers };
}

export async function fund(orgId: string, usd: number) {
  await creditBalance({ orgId, amountMicros: BigInt(Math.round(usd * 1e6)), type: 'ADJUSTMENT', paymentRef: `test:${Math.random()}`, description: 'test funding' });
}

export async function ledgerConsistent(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const buyer = await prisma.billingTransaction.aggregate({ where: { orgId, account: 'BUYER' }, _sum: { amountMicros: true } });
  const seller = await prisma.billingTransaction.aggregate({ where: { orgId, account: 'SELLER', status: { not: 'FAILED' } }, _sum: { amountMicros: true } });
  return org.balanceMicros + org.heldMicros === (buyer._sum.amountMicros ?? 0n) && org.sellerBalanceMicros === (seller._sum.amountMicros ?? 0n) && org.heldMicros === 0n;
}

export { prisma };
