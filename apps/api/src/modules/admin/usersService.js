// Admin Users module — list/get users, assign role, deactivate.
// Restricted to SystemAdmin (SECURITY_DESIGN.md). All actions are audited.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, RoleCode } from '@prisma/client';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  role: z.nativeEnum(RoleCode).optional(),
  active: z.enum(['true', 'false']).optional(),
  search: z.string().max(100).optional()
});

export async function listUsers({ query }) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { page, pageSize, role, active, search } = parsed.data;
  const where = {
    ...(role ? { role: { code: role } } : {}),
    ...(active !== undefined ? { active: active === 'true' } : {}),
    ...(search
      ? { OR: [{ phoneNumber: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
      : {})
  };
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      include: { role: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    db.user.count({ where })
  ]);
  return {
    items: items.map(publicUserForAdmin),
    page,
    pageSize,
    total
  };
}

export async function getUser({ id }) {
  const user = await db.user.findUnique({ where: { id }, include: { role: true, ownerProfile: true } });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }
  return publicUserForAdmin(user, { withProfile: true });
}

export async function listRoles() {
  const roles = await db.role.findMany({ orderBy: { code: 'asc' } });
  return roles;
}

const assignRoleSchema = z.object({ roleCode: z.nativeEnum(RoleCode) });

export async function assignRole({ id, input, request }) {
  const parsed = assignRoleSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.');
  }
  const user = await db.user.findUnique({ where: { id }, include: { role: true } });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }
  const newRole = await db.role.findUnique({ where: { code: parsed.data.roleCode } });
  if (!newRole) {
    throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found.');
  }
  if (user.roleId === newRole.id) {
    return publicUserForAdmin({ ...user, role: newRole });
  }
  const oldSnapshot = { roleId: user.roleId, roleCode: user.role?.code ?? null };
  const updated = await db.user.update({
    where: { id },
    data: { roleId: newRole.id, version: { increment: 1 } },
    include: { role: true }
  });
  await writeAudit(request, AuditAction.RoleAssign, {
    entityType: 'User',
    entityId: id,
    oldSnapshot,
    newSnapshot: { roleId: newRole.id, roleCode: newRole.code }
  });
  return publicUserForAdmin(updated);
}

const deactivateSchema = z.object({ reason: z.string().min(1).max(500) });

export async function deactivateUser({ id, input, request }) {
  const parsed = deactivateSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.');
  }
  const user = await db.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.');
  }
  if (request.user?.id === id) {
    throw new AppError(400, 'SELF_DEACTIVATE', 'You cannot deactivate your own account.');
  }
  const oldSnapshot = { active: user.active };
  const updated = await db.user.update({
    where: { id },
    data: { active: false, lastRefreshTokenJti: null, version: { increment: 1 } },
    include: { role: true }
  });
  await writeAudit(request, AuditAction.Deactivate, {
    entityType: 'User',
    entityId: id,
    oldSnapshot,
    newSnapshot: { active: false, reason: parsed.data.reason }
  });
  return publicUserForAdmin(updated);
}

function publicUserForAdmin(user, { withProfile = false } = {}) {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    email: user.email ?? null,
    role: user.role?.code ?? null,
    preferredLanguage: user.preferredLanguage,
    active: user.active,
    otpVerified: Boolean(user.otpVerifiedAt),
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    version: user.version,
    ...(withProfile && user.ownerProfile
      ? {
          ownerProfile: {
            id: user.ownerProfile.id,
            fullName: user.ownerProfile.fullName,
            nationalId: user.ownerProfile.nationalId,
            physicalAddress: user.ownerProfile.physicalAddress
          }
        }
      : {})
  };
}
