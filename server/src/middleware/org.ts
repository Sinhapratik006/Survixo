import type { NextFunction, Request, Response } from 'express';
import type { OrgRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const PERMISSIONS = {
  'org:manage': ['OWNER', 'ADMIN'],
  'org:delete': ['OWNER'],
  'members:manage': ['OWNER', 'ADMIN'],
  'billing:manage': ['OWNER', 'ADMIN', 'BILLING'],
  'billing:view': ['OWNER', 'ADMIN', 'BILLING', 'VIEWER'],
  'budget:manage': ['OWNER', 'ADMIN', 'BILLING'],
  'keys:manage': ['OWNER', 'ADMIN', 'DEVELOPER'],
  'keys:view': ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'],
  'usage:view': ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'],
  'inference:use': ['OWNER', 'ADMIN', 'DEVELOPER'],
  'routing:manage': ['OWNER', 'ADMIN', 'DEVELOPER'],
  'routing:view': ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'],
  'seller:manage': ['OWNER', 'ADMIN'],
  'seller:view': ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING', 'VIEWER'],
  'webhooks:manage': ['OWNER', 'ADMIN', 'DEVELOPER'],
  'audit:view': ['OWNER', 'ADMIN'],
  'projects:manage': ['OWNER', 'ADMIN', 'DEVELOPER'],
} as const satisfies Record<string, readonly OrgRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: OrgRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

export function permissionsFor(role: OrgRole): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}

/**
 * Resolve the active organization (X-Org-Id header, falling back to the
 * user's personal workspace), verify membership server-side and optionally
 * require a permission.
 */
export function requireOrg(permission?: Permission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    const requested = req.get('x-org-id');
    const membership = requested
      ? await prisma.membership.findUnique({ where: { orgId_userId: { orgId: requested, userId: req.auth.user.id } } })
      : await prisma.membership.findFirst({
          where: { userId: req.auth.user.id },
          orderBy: [{ org: { personal: 'desc' } }, { createdAt: 'asc' }],
        });
    if (!membership) return next(forbidden('You are not a member of this organization', 'not_a_member'));
    if (permission && !can(membership.role, permission)) return next(forbidden(`Your role (${membership.role}) cannot perform this action`));
    req.org = { id: membership.orgId, role: membership.role };
    next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.org) return next(unauthorized());
    if (!can(req.org.role, permission)) return next(forbidden(`Your role (${req.org.role}) cannot perform this action`));
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (req.auth.user.role !== 'ADMIN') return next(forbidden('Platform administrator access required'));
  next();
}
