// Multi-instance distributed lock helpers — used by the 3 schedulers
// (appointment reminder, payment timeout, notification retry) to prevent
// duplicate processing across multiple API server instances.
//
// Uses PostgreSQL's transaction-scoped advisory lock:
//   pg_try_advisory_xact_lock(bigint)
// which is automatically released when the transaction commits or rolls back.
// The "try" variant returns immediately with true/false (does NOT block).
//
// Per PDF §4.8.2: "Database connection pooling is managed through Prisma's
// built-in connection pooler" — this lock leverages the same pool. Each
// scheduler cycle wraps its body in `withAdvisoryLock(key, fn)` which:
//   1. Opens a Prisma transaction
//   2. Tries to acquire the advisory lock (returns immediately if not)
//   3. If acquired, runs the cycle body
//   4. Commits (releasing the lock)
//
// If the DB is unreachable, the helper logs + returns null so the scheduler
// doesn't crash — best-effort scheduling. In a single-instance dev
// deployment, the lock is always immediately granted (no contention).

import { db } from './prisma.js';

// Stable 64-bit integer keys for each scheduler. These MUST be unique per
// scheduler; collisions would cause incorrect locking.
export const ADVISORY_KEYS = Object.freeze({
  APPOINTMENT_REMINDER: 1001,
  PAYMENT_TIMEOUT: 1002,
  NOTIFICATION_RETRY: 1003
});

export async function withAdvisoryLock(key, fn) {
  try {
    return await db.$transaction(async (tx) => {
      // pg_try_advisory_xact_lock returns true if acquired (false if another
      // transaction holds it). Lock is auto-released on commit/rollback.
      const result = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${key}) AS acquired`;
      const acquired = Boolean(result?.[0]?.acquired);
      if (!acquired) {
        // Another instance is processing this cycle; skip silently.
        return null;
      }
      return await fn(tx);
    });
  } catch (error) {
    // Best-effort: scheduler failures must not crash the API. This is also
    // the path taken when the DB is unreachable (dev environment without
    // Postgres running).
    console.error({ event: 'advisory_lock_failed', key, error: error.message });
    return null;
  }
}
