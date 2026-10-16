// Audit middleware — wraps mutating routes to write an audit entry
// (SECURITY_DESIGN.md, NFR-07). The middleware is opt-in: routes attach it
// after the handler completes by calling `request.audit?.write({...})`.
//
// For simplicity we expose a helper that routes call directly:
//   await writeAudit(request, AuditAction.Create, {...})
// so that the old/new snapshots are captured at the moment of mutation,
// not after the response. See modules/* for usage.

import { writeAuditEntry } from '../lib/auditLog.js';

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
    // Audit failures must not silently corrupt the chain; surface them.
    request.log?.error?.({ error }) ?? console.error({ event: 'audit_write_failed', error });
    throw error;
  }
}
