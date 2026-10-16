// Audit module — list/export endpoints restricted to SystemAdmin per
// SECURITY_DESIGN.md. NFR-07: entries are append-only by design; read paths
// never expose password hashes, OTPs, or other private fields.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { verifyAuditChain } from '../../lib/auditLog.js';
import { AuditAction } from '@prisma/client';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  actorUserId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

const REDACTED_KEYS = new Set(['passwordHash', 'otpCodeHash', 'passwordResetToken', 'lastRefreshTokenJti']);

function redact(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (REDACTED_KEYS.has(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = redact(val);
    }
  }
  return out;
}

export async function listAudit({ query }) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { page, pageSize, actorUserId, action, entityType, entityId, from, to } = parsed.data;
  const where = {
    ...(actorUserId ? { actorUserId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    db.auditLog.count({ where })
  ]);
  return {
    items: items.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      requestId: row.requestId,
      ipAddress: row.ipAddress,
      oldSnapshot: redact(row.oldSnapshot),
      newSnapshot: redact(row.newSnapshot),
      previousHash: row.previousHash,
      entryHash: row.entryHash,
      createdAt: row.createdAt
    })),
    page,
    pageSize,
    total
  };
}

export async function exportAudit({ query }) {
  // Same filtering as listAudit but returns CSV. The export path intentionally
  // does NOT include old/new snapshot JSON because those could leak private data;
  // admins can fetch entries individually for forensic review.
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.');
  }
  const { page, pageSize, actorUserId, action, entityType, entityId, from, to } = parsed.data;
  const where = {
    ...(actorUserId ? { actorUserId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
  };
  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize
  });

  const header = ['id', 'createdAt', 'actorUserId', 'action', 'entityType', 'entityId', 'requestId', 'ipAddress', 'entryHash', 'previousHash'];
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.createdAt.toISOString(), r.actorUserId ?? '', r.action, r.entityType, r.entityId ?? '', r.requestId ?? '', r.ipAddress ?? '', r.entryHash, r.previousHash ?? '']
      .map(escape)
      .join(','));
  }
  return { csv: lines.join('\n'), count: rows.length };
}

export async function verifyChain({ limit }) {
  return verifyAuditChain({ limit: limit ?? 1000 });
}
