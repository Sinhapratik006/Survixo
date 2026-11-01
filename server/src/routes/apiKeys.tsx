import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ApiKey, Project } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { microsToUsd, nullableMicrosToUsd, usdToMicros } from '../lib/money.js';
import { parse } from '../middleware/error.js';
import { requireOrg, requirePermission } from '../middleware/org.js';
import { generateApiKey, maskKey } from '../security/apiKeys.js';
import { audit } from '../services/audit.js';
import { emitEvent } from '../services/events.js';
import { clientIp } from '../services/sessions.js';

export const apiKeysRouter = Router();
apiKeysRouter.use(requireOrg());

const MAX_KEYS_PER_ORG = 50;

export function serializeKey(k: ApiKey & { project?: Pick<Project, 'id' | 'name' | 'environment'> | null }) {
  return {
    id: k.id,
    name: k.name,
    maskedKey: maskKey(k.prefix, k.last4),
    project: k.project ?? null,
    spendLimitUsd: nullableMicrosToUsd(k.spendLimitMicros),
    spentUsd: microsToUsd(k.spentMicros),
    rpmLimit: k.rpmLimit,
    expiresAt: k.expiresAt,
    revokedAt: k.revokedAt,
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
    rotatedFromId: k.rotatedFromId,
    status: k.revokedAt ? 'revoked' : k.expiresAt && k.expiresAt < new Date() ? 'expired' : 'active',
  };
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  projectId: z.string().max(40).nullish(),
  spendLimitUsd: z.number().positive().max(1_000_000).nullish(),
  rpmLimit: z.number().int().min(1).max(10_000).nullish(),
  expiresAt: z.coerce.date().nullish(),
});

async function assertProject(req: Request, projectId: string | null | undefined) {
  if (!projectId) return null;
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId: req.org!.id } });
  if (!project) throw badRequest('Project not found in this organization');
  return project.id;
}

apiKeysRouter.get('/', requirePermission('keys:view'), async (req, res) => {
  const keys = await prisma.apiKey.findMany({
    where: { orgId: req.org!.id },
    include: { project: { select: { id: true, name: true, environment: true } } },
    orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
  });
  res.json({ data: keys.map(serializeKey) });
});

apiKeysRouter.post('/', requirePermission('keys:manage'), async (req, res) => {
  const body = parse(createSchema, req.body);
  if (body.expiresAt && body.expiresAt < new Date()) throw badRequest('Expiry must be in the future');
  const active = await prisma.apiKey.count({ where: { orgId: req.org!.id, revokedAt: null } });
  if (active >= MAX_KEYS_PER_ORG) throw badRequest(`An organization can have at most ${MAX_KEYS_PER_ORG} active keys`);
  const projectId = await assertProject(req, body.projectId);
  const generated = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      orgId: req.org!.id,
      projectId,
      createdById: req.auth!.user.id,
      name: body.name,
      prefix: generated.prefix,
      last4: generated.last4,
      keyHash: generated.hash,
      spendLimitMicros: body.spendLimitUsd ? usdToMicros(body.spendLimitUsd) : null,
      rpmLimit: body.rpmLimit ?? null,
      expiresAt: body.expiresAt ?? null,
    },
    include: { project: { select: { id: true, name: true, environment: true } } },
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'api_key.created', targetType: 'api_key', targetId: key.id, ip: clientIp(req), metadata: { name: key.name } });
  // The plaintext key is returned exactly once and never stored.
  res.status(201).json({ key: serializeKey(key), secret: generated.plaintext });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  projectId: z.string().max(40).nullish(),
  spendLimitUsd: z.number().positive().max(1_000_000).nullish(),
  rpmLimit: z.number().int().min(1).max(10_000).nullish(),
  expiresAt: z.coerce.date().nullish(),
});

apiKeysRouter.patch('/:id', requirePermission('keys:manage'), async (req, res) => {
  const body = parse(updateSchema, req.body);
  const key = await prisma.apiKey.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!key) throw notFound('API key not found');
  if (key.revokedAt) throw badRequest('Revoked keys cannot be edited');
  const updated = await prisma.apiKey.update({
    where: { id: key.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.projectId !== undefined && { projectId: await assertProject(req, body.projectId) }),
      ...(body.spendLimitUsd !== undefined && { spendLimitMicros: body.spendLimitUsd ? usdToMicros(body.spendLimitUsd) : null }),
      ...(body.rpmLimit !== undefined && { rpmLimit: body.rpmLimit }),
      ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt }),
    },
    include: { project: { select: { id: true, name: true, environment: true } } },
  });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'api_key.updated', targetType: 'api_key', targetId: key.id, ip: clientIp(req), metadata: body as never });
  res.json({ key: serializeKey(updated) });
});

async function revoke(req: Request, keyId: string, reason: string) {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, orgId: req.org!.id } });
  if (!key) throw notFound('API key not found');
  if (key.revokedAt) return key;
  const updated = await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await audit({ orgId: req.org!.id, actorUserId: req.auth!.user.id, action: 'api_key.revoked', targetType: 'api_key', targetId: key.id, ip: clientIp(req), metadata: { reason } });
  await emitEvent({
    orgId: req.org!.id,
    type: 'key.revoked',
    title: `API key "${key.name}" was revoked`,
    body: `Revoked by ${req.auth!.user.email} (${reason}).`,
    data: { key_id: key.id, name: key.name, reason },
  });
  return updated;
}

apiKeysRouter.post('/:id/revoke', requirePermission('keys:manage'), async (req, res) => {
  const key = await revoke(req, String(req.params.id), 'manual');
  res.json({ key: serializeKey(key) });
});

/** Rotation: issue a new key with the same settings, then revoke the old one. */
apiKeysRouter.post('/:id/rotate', requirePermission('keys:manage'), async (req, res) => {
  const old = await prisma.apiKey.findFirst({ where: { id: String(req.params.id), orgId: req.org!.id } });
  if (!old) throw notFound('API key not found');
  if (old.revokedAt) throw badRequest('Revoked keys cannot be rotated');
  const generated = generateApiKey();
  const fresh = await prisma.apiKey.create({
    data: {
      orgId: old.orgId,
      projectId: old.projectId,
      createdById: req.auth!.user.id,
      name: old.name,
      prefix: generated.prefix,
      last4: generated.last4,
      keyHash: generated.hash,
      spendLimitMicros: old.spendLimitMicros,
      rpmLimit: old.rpmLimit,
      expiresAt: old.expiresAt,
      rotatedFromId: old.id,
    },
    include: { project: { select: { id: true, name: true, environment: true } } },
  });
  await revoke(req, old.id, 'rotated');
  res.status(201).json({ key: serializeKey(fresh), secret: generated.plaintext });
});
