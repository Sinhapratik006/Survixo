import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { slugify } from '../lib/ids.js';
import { creditBalance } from '../billing/ledger.js';
import { usdToMicros } from '../lib/money.js';
import { logger } from '../lib/logger.js';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
    if (!(await prisma.organization.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${randomBytes(6).toString('hex')}`;
}

/** Create a user with a personal workspace (they are its OWNER). */
export async function createUserWithWorkspace(input: {
  email: string;
  name?: string | null;
  passwordHash?: string | null;
  emailVerified: boolean;
  avatarUrl?: string | null;
  google?: { sub: string; email: string };
}) {
  const email = normalizeEmail(input.email);
  const displayName = input.name?.trim() || email.split('@')[0]!;
  const slug = await uniqueOrgSlug(`${displayName}-workspace`);
  const user = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        passwordHash: input.passwordHash ?? null,
        emailVerified: input.emailVerified,
        avatarUrl: input.avatarUrl ?? null,
        role: env.ADMIN_EMAILS.map(normalizeEmail).includes(email) ? 'ADMIN' : 'USER',
        ...(input.google ? { accounts: { create: { provider: 'google', providerAccountId: input.google.sub, email: input.google.email } } } : {}),
      },
    });
    const org = await tx.organization.create({ data: { name: `${displayName}'s workspace`, slug, personal: true } });
    await tx.membership.create({ data: { orgId: org.id, userId: user.id, role: 'OWNER' } });
    await tx.routingPolicy.create({ data: { orgId: org.id, name: 'Default', mode: 'LOWEST_COST', isDefault: true } });
    return { user, orgId: org.id };
  });

  // Demo billing only: clearly-labelled demo credit so the flow can be tried without payments.
  if (env.BILLING_MODE === 'demo' && env.SIGNUP_DEMO_CREDIT_USD > 0) {
    await creditBalance({
      orgId: user.orgId,
      amountMicros: usdToMicros(env.SIGNUP_DEMO_CREDIT_USD),
      type: 'DEMO_CREDIT',
      paymentRef: `signup-demo:${user.orgId}`,
      description: 'Demo credit (not real money) granted at sign-up',
    }).catch((err) => logger.error({ err }, 'failed to grant demo credit'));
  }
  return user.user;
}
