// Audit middleware helpers — see ../../lib/auditLog.js for the hash chain.
//
// Two paths are exposed:
//   - `writeAudit(request, action, fields)` for mutations (Create/Update/
//     Delete/Approve/Reject). Already used by all mutating endpoints in
//     M3-M10.
//   - `auditView(request, entityType, entityId)` for sensitive reads per
//     NFR-07: "All CRUD operations must be logged... 100% of operations
//     logged" — including views. Added in M11 to close the audit-trail gap
//     for parcel/transfer/document/certificate/payment detail reads.
//
// View audits are best-effort: a failed audit write must not block the
// response (the user has already been authorized to see the data; we just
// want the trail). Mutations throw on audit failure because audit
// integrity matters more than the response in that path.

import { writeAuditEntry } from '../lib/auditLog.js';
import { AuditAction } from '@prisma/client';

export async function writeAudit(request, action, fields) {
  const actorUserId = request.user?.id ?? null;
  const ipAddress =
    request.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.socket?.remoteAddress ??
    null;
  try {
    return await writeAuditEntry({
      actorUserId,
      action,
      entityType: fields.entityType,
      entityId: fields.entityId,
      requestId: request.id,
      ipAddress,
      oldSnapshot: fields.oldSnapshot ?? null,
      newSnapshot: fields.newSnapshot ?? null
    });
  } catch (error) {
    request.log?.error?.({ error }) ?? console.error({ event: 'audit_write_failed', error });
    throw error;
  }
}

// Best-effort audit for view operations. Catches and logs the failure
// without rethrowing — the response should still go out.
export async function auditView(request, entityType, entityId, extra = {}) {
  try {
    return await writeAuditEntry({
      actorUserId: request.user?.id ?? null,
      action: AuditAction.View,
      entityType,
      entityId,
      requestId: request.id,
      ipAddress:
        request.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.socket?.remoteAddress ??
        null,
      newSnapshot: { viewedAt: new Date().toISOString(), ...extra }
    });
  } catch (error) {
    console.error({ event: 'audit_view_failed', entityType, entityId, error: error.message });
  }
}
