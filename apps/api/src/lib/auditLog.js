// Audit log service implementing NFR-07 (immutable, tamper-evident audit trail)
// and SECURITY_DESIGN.md audit rules. Each entry stores a SHA-256 entry_hash
// that is computed over the prior hash + this entry's canonical payload, so
// tampering with any row breaks the chain. The table itself has no UPDATE/DELETE
// in application code; only SystemAdmin can read/export.

import { createHash } from 'node:crypto';
import { db } from './prisma.js';

function canonicalPayload(entry) {
  // Stable JSON ordering — Prisma writes the row from these fields.
  return JSON.stringify({
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    requestId: entry.requestId ?? null,
    ipAddress: entry.ipAddress ?? null,
    oldSnapshot: entry.oldSnapshot ?? null,
    newSnapshot: entry.newSnapshot ?? null,
    previousHash: entry.previousHash ?? null,
    createdAt: entry.createdAt ?? new Date().toISOString()
  });
}

function computeHash(entry) {
  return createHash('sha256').update(canonicalPayload(entry)).digest('hex');
}

export async function writeAuditEntry({
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  requestId = null,
  ipAddress = null,
  oldSnapshot = null,
  newSnapshot = null
}) {
  const createdAt = new Date();
  // Fetch the most recent entry hash to chain from. Ordering by createdAt desc
  // is sufficient because the @@index([createdAt]) index supports it; ties are
  // broken by id for determinism.
  const latest = await db.auditLog.findFirst({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { entryHash: true }
  });
  const previousHash = latest?.entryHash ?? null;
  const entryHash = computeHash({
    actorUserId,
    action,
    entityType,
    entityId,
    requestId,
    ipAddress,
    oldSnapshot,
    newSnapshot,
    previousHash,
    createdAt: createdAt.toISOString()
  });
  const created = await db.auditLog.create({
    data: {
      actorUserId,
      action,
      entityType,
      entityId,
      requestId,
      ipAddress,
      oldSnapshot,
      newSnapshot,
      previousHash,
      entryHash
    }
  });
  return created;
}

// Verify the chain from a given starting point. Returns the first broken entry
// (or null if the chain is intact for the inspected window). Useful for an
// admin integrity-check endpoint in a future milestone.
export async function verifyAuditChain({ limit = 1000 } = {}) {
  const rows = await db.auditLog.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit
  });
  let previousHash = null;
  for (const row of rows) {
    if (row.previousHash !== previousHash) {
      return { ok: false, brokenAt: row.id };
    }
    const recomputed = computeHash(row);
    if (recomputed !== row.entryHash) {
      return { ok: false, brokenAt: row.id };
    }
    previousHash = row.entryHash;
  }
  return { ok: true, brokenAt: null, inspected: rows.length };
}
