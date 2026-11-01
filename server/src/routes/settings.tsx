import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { parse } from '../middleware/error.js';
import { requireOrg } from '../middleware/org.js';
import { rateLimit, userKey } from '../middleware/rateLimit.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { audit } from '../services/audit.js';
import { clearSessionCookies, clientIp, revokeAllSessions } from '../services/sessions.js';

export const settingsRouter = Router();

settingsRouter.patch('/profile', async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(100).optional(), theme: z.enum(['light', 'dark', 'system']).optional() }), req.body);
  await prisma.user.update({ where: { id: req.auth!.user.id }, data: body });
  res.json({ ok: true });
});

const passwordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(10, 'Password must be at least 10 characters').max(128),
});

settingsRouter.post('/password', rateLimit({ name: 'password-change', windowSeconds: 900, max: 5, key: userKey }), async (req, res) => {
  const body = parse(passwordSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.user.id } });
  if (user.passwordHash) {
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, user.passwordHash)))
      throw unauthorized('Current password is incorrect', 'invalid_credentials');
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
  const revoked = await revokeAllSessions(user.id, req.auth!.sessionId);
  await audit({ actorUserId: user.id, action: user.passwordHash ? 'auth.password.changed' : 'auth.password.set', ip: clientIp(req), metadata: { otherSessionsRevoked: revoked } });
  res.json({ ok: true, otherSessionsRevoked: revoked });
});

settingsRouter.get('/sessions', async (req, res) => {
  const sessions = await prisma.session.findMany({ where: { userId: req.auth!.user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' } });
  res.json({
    data: sessions.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt, current: s.id === req.auth!.sessionId })),
  });
});

settingsRouter.delete('/sessions/:id', async (req, res) => {
  const r = await prisma.session.deleteMany({ where: { id: String(req.params.id), userId: req.auth!.user.id } });
  if (!r.count) throw notFound('Session not found');
  await audit({ actorUserId: req.auth!.user.id, action: 'auth.session.revoked', ip: clientIp(req) });
  if (String(req.params.id) === req.auth!.sessionId) clearSessionCookies(res);
  res.json({ ok: true });
});

settingsRouter.post('/sessions/revoke-others', async (req, res) => {
  const count = await revokeAllSessions(req.auth!.user.id, req.auth!.sessionId);
  await audit({ actorUserId: req.auth!.user.id, action: 'auth.session.revoked_others', ip: clientIp(req), metadata: { count } });
  res.json({ ok: true, revoked: count });
});

settingsRouter.delete('/oauth/google', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.user.id } });
  if (!user.passwordHash) throw badRequest('Set a password before unlinking Google, or you would be locked out.');
  await prisma.oAuthAccount.deleteMany({ where: { userId: user.id, provider: 'google' } });
  await audit({ actorUserId: user.id, action: 'auth.google.unlinked', ip: clientIp(req) });
  res.json({ ok: true });
});

/**
 * Account deletion: removes the user, their sessions, linked accounts,
 * favorites and their personal workspace (including its request history).
 * Blocked while the user is the sole owner of a team or holds unpaid seller funds.
 */
settingsRouter.delete('/account', rateLimit({ name: 'account-delete', windowSeconds: 3600, max: 3, key: userKey }), async (req, res) => {
  const { confirmEmail } = parse(z.object({ confirmEmail: z.string() }), req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.user.id } });
  if (confirmEmail.trim().toLowerCase() !== user.email) throw badRequest('Type your email address exactly to confirm');
  const memberships = await prisma.membership.findMany({ where: { userId: user.id }, include: { org: { include: { _count: { select: { members: true } } } } } });
  for (const m of memberships) {
    // Personal workspaces and team orgs where the user is the only member are deleted with the account.
    if (m.org.personal || m.org._count.members === 1) {
      if (m.org.balanceMicros > 0n && !m.org.personal)
        throw badRequest(`"${m.org.name}" still has a buyer balance. Spend it or delete the organization first.`);
      if (m.org.sellerBalanceMicros > 0n || m.org.heldMicros > 0n) throw badRequest('Your workspace still has seller earnings or in-flight requests. Request a payout or wait before deleting.');
      const pending = await prisma.payout.count({ where: { orgId: m.orgId, status: { in: ['REQUESTED', 'PROCESSING'] } } });
      if (pending) throw badRequest('You have pending payouts. Wait for them to complete before deleting your account.');
    } else if (m.role === 'OWNER' && m.org._count.members > 1) {
      const owners = await prisma.membership.count({ where: { orgId: m.orgId, role: 'OWNER' } });
      if (owners <= 1) throw badRequest(`Transfer ownership of "${m.org.name}" before deleting your account.`);
    }
  }
  const personal = memberships.filter((m) => m.org.personal || m.org._count.members === 1).map((m) => m.orgId);
  await audit({ actorUserId: null, action: 'account.deleted', targetType: 'user', targetId: user.id, ip: clientIp(req) });
  await prisma.$transaction([prisma.organization.deleteMany({ where: { id: { in: personal } } }), prisma.user.delete({ where: { id: user.id } })]);
  clearSessionCookies(res);
  res.json({ ok: true });
});

// ───────────── Favorites & saved comparisons ─────────────

export const favoritesRouter = Router();

favoritesRouter.get('/', async (req, res) => {
  const favs = await prisma.favorite.findMany({ where: { userId: req.auth!.user.id }, orderBy: { createdAt: 'desc' } });
  res.json({ data: favs.map((f) => f.modelId) });
});

favoritesRouter.put('/:modelId', async (req, res) => {
  const model = await prisma.model.findUnique({ where: { id: String(req.params.modelId) } });
  if (!model) throw notFound('Model not found');
  await prisma.favorite.upsert({ where: { userId_modelId: { userId: req.auth!.user.id, modelId: model.id } }, create: { userId: req.auth!.user.id, modelId: model.id }, update: {} });
  res.json({ ok: true });
});

favoritesRouter.delete('/:modelId', async (req, res) => {
  await prisma.favorite.deleteMany({ where: { userId: req.auth!.user.id, modelId: String(req.params.modelId) } });
  res.json({ ok: true });
});

export const comparisonsRouter = Router();

comparisonsRouter.get('/', async (req, res) => {
  const rows = await prisma.savedComparison.findMany({
    where: { userId: req.auth!.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, modelIds: true, createdAt: true },
  });
  res.json({ data: rows });
});

comparisonsRouter.post('/', async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(60), modelIds: z.array(z.string().max(200)).min(2).max(4) }), req.body);
  const count = await prisma.savedComparison.count({ where: { userId: req.auth!.user.id } });
  if (count >= 50) throw badRequest('At most 50 saved comparisons');
  const found = await prisma.model.count({ where: { id: { in: body.modelIds } } });
  if (found !== new Set(body.modelIds).size) throw badRequest('Unknown model in comparison');
  const comparison = await prisma.savedComparison.create({
    data: { userId: req.auth!.user.id, ...body },
    select: { id: true, name: true, modelIds: true, createdAt: true },
  });
  res.status(201).json({ comparison });
});

comparisonsRouter.delete('/:id', async (req, res) => {
  await prisma.savedComparison.deleteMany({ where: { id: String(req.params.id), userId: req.auth!.user.id } });
  res.json({ ok: true });
});

export { requireOrg };
