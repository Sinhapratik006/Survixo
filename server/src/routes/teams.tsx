import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { microsToUsd } from '../lib/money.js';
import { parse } from '../middleware/error.js';
import { permissionsFor, requireOrg, requirePermission } from '../middleware/org.js';
import { audit } from '../services/audit.js';
import { clientIp } from '../services/sessions.js';
import { normalizeEmail, uniqueOrgSlug } from '../services/users.js';

export const teamsRouter = Router();

const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'] as const;

teamsRouter.post('/', requireOrg(), async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(2).max(60) }), req.body);
  const owned = await prisma.membership.count({ where: { userId: req.auth!.user.id, role: 'OWNER' } });
  if (owned >= 10) throw badRequest('You can own at most 10 organizations');
  const org = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name, slug: await uniqueOrgSlug(name) } });
    await tx.membership.create({ data: { orgId: org.id, userId: req.auth!.user.id, role: 'OWNER' } });
    await tx.routingPolicy.create({ data: { orgId: org.id, name: 'Default', isDefault: true } });
    return org;
  });
  await audit({ orgId: org.id, actorUserId: req.auth!.user.id, action: 'org.created', targetType: 'organization', targetId: org.id, ip: clientIp(req) });
  res.status(201).json({ org: { id: org.id, name: org.name, slug: org.slug, personal: false, role: 'OWNER' } });
});

teamsRouter.use(requireOrg());

teamsRouter.get('/current', async (req, res) => {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: req.org!.id },
    include: {
      members: { include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } }, orderBy: { createdAt: 'asc' } },
      projects: { include: { routingPolicy: { select: { id: true, name: true } }, _count: { select: { apiKeys: { where: { revokedAt: null } } } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  res.json({
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      personal: org.personal,
      promptRetention: org.promptRetention,
      requestLogRetentionDays: org.requestLogRetentionDays,
      createdAt: org.createdAt,
    },
    role: req.org!.role,
    permissions: permissionsFor(req.org!.role),
    members: org.members.map((m) => ({ userId: m.user.id, email: m.user.email, name: m.user.name, avatarUrl: m.user.avatarUrl, role: m.role, joinedAt: m.createdAt })),
    projects: org.projects.map((p) => ({ id: p.id, name: p.name, environment: p.environment, routingPolicy: p.routingPolicy, activeKeys: p._count.apiKeys, createdAt: p.createdAt })),
  });
});

teamsRouter.patch('/current', requirePermission('org:manage'), async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(2).max(60) }), req.body);
  await prisma.organization.update({ where: { id: req.org!.id }, data: { name } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'org.renamed', ip: clientIp(req), metadata: { name } });
  res.json({ ok: true });
});

const retentionSchema = z.object({
  promptRetention: z.enum(['NONE', 'REDACTED_7D', 'REDACTED_30D']),
  requestLogRetentionDays: z.number().int().min(7).max(365),
});

teamsRouter.put('/current/retention', requirePermission('org:manage'), async (req, res) => {
  const body = parse(retentionSchema, req.body);
  await prisma.organization.update({ where: { id: req.org!.id }, data: body });
  if (body.promptRetention === 'NONE') {
    // Turning retention off purges any stored prompts immediately.
    await prisma.$executeRaw`UPDATE "InferenceRequest" SET payload = NULL, "payloadExpiresAt" = NULL WHERE "orgId" = ${req.org!.id} AND payload IS NOT NULL`;
  }
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'org.retention.updated', ip: clientIp(req), metadata: body });
  res.json({ ok: true });
});

teamsRouter.delete('/current', requirePermission('org:delete'), async (req, res) => {
  const { confirmName } = parse(z.object({ confirmName: z.string() }), req.body);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.org!.id } });
  if (org.personal) throw badRequest('Personal workspaces are deleted with your account');
  if (confirmName !== org.name) throw badRequest('Type the organization name exactly to confirm');
  if (org.balanceMicros > 0n || org.sellerBalanceMicros > 0n || org.heldMicros > 0n)
    throw badRequest(`Withdraw or spend the remaining balance first (buyer $${microsToUsd(org.balanceMicros).toFixed(2)}, seller $${microsToUsd(org.sellerBalanceMicros).toFixed(2)})`);
  await audit({ actorUserId: req.auth!.user.id, action: 'org.deleted', targetType: 'organization', targetId: org.id, ip: clientIp(req), metadata: { name: org.name } });
  await prisma.organization.delete({ where: { id: org.id } });
  res.json({ ok: true });
});

// ───────────── Members ─────────────

const memberSchema = z.object({ email: z.string().trim().email(), role: z.enum(ROLES) });

teamsRouter.post('/current/members', requirePermission('members:manage'), async (req, res) => {
  const body = parse(memberSchema, req.body);
  if (body.role === 'OWNER' && req.org!.role !== 'OWNER') throw forbidden('Only owners can add owners');
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.org!.id } });
  if (org.personal) throw badRequest('Personal workspaces cannot have members. Create a team organization instead.');
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(body.email) } });
  if (!user || user.deletedAt) throw notFound('No Nexovra account uses this email. Ask them to sign up first, then add them.', 'user_not_found');
  const existing = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: org.id, userId: user.id } } });
  if (existing) throw conflict('This user is already a member');
  await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: body.role } });
  await audit({ orgId: org.id, actorUserId: req.auth!.user.id, action: 'member.added', targetType: 'user', targetId: user.id, ip: clientIp(req), metadata: { role: body.role } });
  res.status(201).json({ ok: true });
});

async function ownerCount(orgId: string) {
  return prisma.membership.count({ where: { orgId, role: 'OWNER' } });
}

teamsRouter.patch('/current/members/:userId', requirePermission('members:manage'), async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(ROLES) }), req.body);
  const m = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: req.org!.id, userId: String(req.params.userId) } } });
  if (!m) throw notFound('Member not found');
  if ((m.role === 'OWNER' || role === 'OWNER') && req.org!.role !== 'OWNER') throw forbidden('Only owners can change owner roles');
  if (m.role === 'OWNER' && role !== 'OWNER' && (await ownerCount(req.org!.id)) <= 1) throw badRequest('An organization must keep at least one owner');
  await prisma.membership.update({ where: { id: m.id }, data: { role } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'member.role_changed', targetType: 'user', targetId: m.userId, ip: clientIp(req), metadata: { from: m.role, to: role } });
  res.json({ ok: true });
});

teamsRouter.delete('/current/members/:userId', async (req, res) => {
  const self = String(req.params.userId) === req.auth!.user.id;
  if (!self && !permissionsFor(req.org!.role).includes('members:manage')) throw forbidden();
  const m = await prisma.membership.findUnique({ where: { orgId_userId: { orgId: req.org!.id, userId: String(req.params.userId) } }, include: { org: true } });
  if (!m) throw notFound('Member not found');
  if (m.org.personal) throw badRequest('You cannot leave your personal workspace');
  if (m.role === 'OWNER' && !self && req.org!.role !== 'OWNER') throw forbidden('Only owners can remove owners');
  if (m.role === 'OWNER' && (await ownerCount(req.org!.id)) <= 1) throw badRequest('An organization must keep at least one owner');
  await prisma.membership.delete({ where: { id: m.id } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: self ? 'member.left' : 'member.removed', targetType: 'user', targetId: m.userId, ip: clientIp(req) });
  res.json({ ok: true });
});

// ───────────── Projects ─────────────

const projectSchema = z.object({
  name: z.string().trim().min(1).max(60),
  environment: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']).default('DEVELOPMENT'),
  routingPolicyId: z.string().max(40).nullish(),
});

async function assertPolicy(orgId: string, id: string | null | undefined) {
  if (!id) return null;
  const p = await prisma.routingPolicy.findFirst({ where: { id, orgId } });
  if (!p) throw badRequest('Routing policy not found in this organization');
  return id;
}

teamsRouter.post('/current/projects', requirePermission('projects:manage'), async (req, res) => {
  const body = parse(projectSchema, req.body);
  if (await prisma.project.findFirst({ where: { orgId: req.org!.id, name: body.name } })) throw conflict('A project with this name already exists');
  const project = await prisma.project.create({
    data: { orgId: req.org!.id, name: body.name, environment: body.environment, routingPolicyId: await assertPolicy(req.org!.id, body.routingPolicyId) },
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'project.created', targetType: 'project', targetId: project.id, ip: clientIp(req) });
  res.status(201).json({ project });
});

teamsRouter.patch('/current/projects/:id', requirePermission('projects:manage'), async (req, res) => {
  const body = parse(projectSchema.partial(), req.body);
  const project = await prisma.project.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!project) throw notFound('Project not found');
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.environment && { environment: body.environment }),
      ...(body.routingPolicyId !== undefined && { routingPolicyId: await assertPolicy(req.org!.id, body.routingPolicyId) }),
    },
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'project.updated', targetType: 'project', targetId: project.id, ip: clientIp(req) });
  res.json({ project: updated });
});

teamsRouter.delete('/current/projects/:id', requirePermission('projects:manage'), async (req, res) => {
  const project = await prisma.project.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!project) throw notFound('Project not found');
  await prisma.project.delete({ where: { id: project.id } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'project.deleted', targetType: 'project', targetId: project.id, ip: clientIp(req) });
  res.json({ ok: true });
});

// ───────────── Audit log ─────────────

teamsRouter.get('/current/audit', requirePermission('audit:view'), async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const rows = await prisma.auditLog.findMany({
    where: { orgId: req.org!.id },
    include: { actor: { select: { email: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  res.json({
    data: page.map((a) => ({ id: a.id, action: a.action, actor: a.actor?.email ?? null, targetType: a.targetType, targetId: a.targetId, ip: a.ip, metadata: a.metadata, createdAt: a.createdAt })),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  });
});
