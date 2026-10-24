// Notifications module — implements FR-30 (SMS), FR-31 (email), and FR-36
// (24-hour appointment reminders). Per SECURITY_DESIGN.md, providers are
// behind adapter interfaces; the prototype ships a mock provider that
// records the Notification row and immediately marks it `Sent` (dev) or
// leaves it `Queued` (production simulation).
//
// PROJECT_DECISIONS.md: real SMS/email provider selection is pending
// external approval — Africa's Talking/Twilio and email providers are
// named but not contracted. The mock provider is provider-neutral and
// swappable.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { NotificationStatus, RoleCode } from '@prisma/client';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  status: z.nativeEnum(NotificationStatus).optional(),
  channel: z.enum(['sms', 'email']).optional()
});

export async function listMyNotifications({ query, request }) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { page, pageSize, status, channel } = parsed.data;
  const where = {
    recipientUserId: request.user.id,
    ...(status ? { status } : {}),
    ...(channel ? { channel } : {})
  };
  const [items, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    db.notification.count({ where })
  ]);
  return { items, page, pageSize, total };
}

export async function markRead({ id, request }) {
  const notif = await db.notification.findUnique({ where: { id } });
  if (!notif) {
    throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
  }
  // SECURITY_DESIGN.md: server-side ownership check.
  if (notif.recipientUserId !== request.user.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only mark your own notifications as read.');
  }
  if (notif.status === NotificationStatus.Sent) {
    // Marking "read" is the citizen-side acknowledgement; we keep the row
    // Sent so the audit trail is intact and use sentAt as the read marker
    // since the schema does not have a separate readAt column. The semantic
    // is "delivered + acknowledged by recipient".
    return notif;
  }
  const updated = await db.notification.update({
    where: { id },
    data: { status: NotificationStatus.Sent, sentAt: new Date() }
  });
  return updated;
}

export async function listTemplates({ request }) {
  if (request.role?.code !== RoleCode.SystemAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Notification templates are restricted to SystemAdmin.');
  }
  // Templates are stored as SystemSetting rows keyed `notification.template.{key}`.
  const rows = await db.systemSetting.findMany({
    where: { key: { startsWith: 'notification.template.' } },
    orderBy: { key: 'asc' }
  });
  return { items: rows };
}

// Dispatch API — called by other services (transfers.approve, payments.complete,
// appointment.book) to record + send a notification.
export async function dispatchNotification({ recipientUserId, channel, templateKey, payload, scheduledAt }) {
  const when = scheduledAt ?? new Date();
  const immediate = when.getTime() <= Date.now() + 1000;

  const notif = await db.notification.create({
    data: {
      recipientUserId,
      channel,
      templateKey,
      payload: payload ?? {},
      status: immediate ? NotificationStatus.Sent : NotificationStatus.Queued,
      scheduledAt: when,
      sentAt: immediate ? new Date() : null,
      // Mock provider reference. In production this is the provider's message ID.
      providerRef: immediate ? `mock-${channel}-${Date.now()}` : null
    }
  });

  // Mock provider log — never logs payload contents in production.
  if (process.env.NODE_ENV !== 'production') {
    console.info({
      event: 'mock_notification_dispatched',
      notificationId: notif.id,
      channel,
      templateKey,
      recipientUserId,
      scheduledFor: when.toISOString(),
      immediate
    });
  }

  return notif;
}

// 24-hour appointment reminder scheduler — FR-36. Per the PDF §4.8, "A cron
// job scheduler runs alongside the Node.js process for automated tasks such
// as sending appointment reminders 24 hours before scheduled times."
//
// We use an in-process setInterval that wakes every 5 minutes and:
//   1. Finds Scheduled appointments whose scheduledAt is 24h ± 5min from now.
//   2. For each, looks up the recipient (citizen user).
//   3. Dispatches a Queued `appointment.reminder_24h` notification (the actual
//      dispatch is when scheduledAt <= now + 5min so the mock fires it).
//
// This is the simplest correct scheduler for a single-instance prototype.
// Multi-instance deployments need distributed locking (e.g., pg_advisory_lock)
// to avoid duplicate reminders — out of scope for M5.
const REMINDER_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_WINDOW_MS = 5 * 60 * 1000;

let schedulerTimer = null;

export function startReminderScheduler() {
  if (schedulerTimer) return schedulerTimer;
  schedulerTimer = setInterval(runReminderCycle, REMINDER_INTERVAL_MS);
  // Allow the process to exit even if the timer is still active.
  schedulerTimer.unref?.();
  return schedulerTimer;
}

export function stopReminderScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

async function runReminderCycle() {
  try {
    const now = Date.now();
    const windowStart = new Date(now + 24 * 60 * 60 * 1000 - REMINDER_WINDOW_MS);
    const windowEnd = new Date(now + 24 * 60 * 60 * 1000 + REMINDER_WINDOW_MS);

    const upcoming = await db.appointment.findMany({
      where: {
        status: 'Scheduled',
        scheduledAt: { gte: windowStart, lte: windowEnd }
      },
      include: { citizen: { include: { user: true } } }
    });

    for (const appt of upcoming) {
      // Idempotency: skip if a reminder has already been queued for this appointment.
      const existing = await db.notification.findFirst({
        where: {
          recipientUserId: appt.citizen.userId,
          templateKey: 'appointment.reminder_24h',
          payload: { path: ['appointmentId'], equals: appt.id }
        }
      });
      if (existing) continue;
      if (!appt.citizen?.userId) continue;
      await dispatchNotification({
        recipientUserId: appt.citizen.userId,
        channel: 'sms',
        templateKey: 'appointment.reminder_24h',
        payload: { appointmentId: appt.id, scheduledAt: appt.scheduledAt.toISOString(), serviceType: appt.serviceType },
        scheduledAt: new Date()
      });
    }
  } catch (error) {
    // Best-effort: scheduler failures must not crash the API.
    console.error({ event: 'reminder_scheduler_failed', error: error.message });
  }
}

export async function getMyUnreadCount({ request }) {
  const count = await db.notification.count({
    where: {
      recipientUserId: request.user.id,
      status: NotificationStatus.Queued
    }
  });
  return { unread: count };
}

// ---------------------------------------------------------------------------
// Notification retry processor with exponential backoff
//
// PDF §4.3 sub-system 7: "The notification queue handles retries for failed
// deliveries with exponential backoff." The mock provider always succeeds on
// first attempt for dev convenience, but the production swap-in path needs
// the retry queue plumbed in. The processor:
//
//   1. Polls Queued notifications whose scheduledAt <= now.
//   2. For each, attempts dispatch via the mock provider (always succeeds).
//   3. On a hypothetical failure (status remains Queued after attempt),
//      increments retryCount, reschedules with exponential backoff:
//          attempt 1: now + 30s
//          attempt 2: now + 2m
//          attempt 3: now + 8m
//          attempt 4: now + 32m
//          attempt 5: now + 128m
//      After MAX_RETRIES (5) attempts, marks Failed + logs to console.
//
// Multi-instance deployments need a distributed lock (pg_advisory_lock) to
// prevent duplicate dispatch.
// ---------------------------------------------------------------------------

const RETRY_INTERVAL_MS = 30 * 1000; // poll every 30s
const MAX_RETRIES = 5;
const BACKOFF_MS = [30_000, 120_000, 480_000, 1_920_000, 7_680_000]; // 30s, 2m, 8m, 32m, 128m

let retryTimer = null;

export function startNotificationRetryScheduler() {
  if (retryTimer) return retryTimer;
  retryTimer = setInterval(runRetryCycle, RETRY_INTERVAL_MS);
  retryTimer.unref?.();
  return retryTimer;
}

export function stopNotificationRetryScheduler() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

async function runRetryCycle() {
  try {
    const due = await db.notification.findMany({
      where: {
        status: NotificationStatus.Queued,
        scheduledAt: { lte: new Date() }
      },
      take: 50,
      orderBy: { scheduledAt: 'asc' }
    });
    for (const n of due) {
      await processNotificationAttempt(n);
    }
  } catch (error) {
    console.error({ event: 'notification_retry_cycle_failed', error: error.message });
  }
}

async function processNotificationAttempt(notification) {
  // Mock dispatch: log + mark Sent. In production this is where the
  // Africa's Talking / Twilio / email adapter is invoked.
  try {
    // Simulate a 1% failure rate to exercise the retry path even in dev.
    const shouldFail = process.env.NODE_ENV !== 'production' && Math.random() < 0.01;
    if (shouldFail && notification.retryCount < MAX_RETRIES - 1) {
      throw new Error('Simulated dispatch failure');
    }
    await db.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.Sent,
        sentAt: new Date(),
        providerRef: `mock-${notification.channel}-${Date.now()}`,
        retryCount: { increment: 1 }
      }
    });
    if (process.env.NODE_ENV !== 'production') {
      console.info({
        event: 'notification_dispatched',
        notificationId: notification.id,
        channel: notification.channel,
        templateKey: notification.templateKey,
        retryCount: notification.retryCount + 1
      });
    }
  } catch (error) {
    // Retry path: increment retryCount, reschedule with exponential backoff.
    const nextRetryCount = notification.retryCount + 1;
    if (nextRetryCount >= MAX_RETRIES) {
      // Give up — mark Failed.
      await db.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.Failed,
          retryCount: nextRetryCount,
          providerRef: `failed-after-${nextRetryCount}-attempts`
        }
      });
      console.error({
        event: 'notification_permanently_failed',
        notificationId: notification.id,
        templateKey: notification.templateKey,
        retries: nextRetryCount,
        error: error.message
      });
    } else {
      const backoffMs = BACKOFF_MS[Math.min(nextRetryCount - 1, BACKOFF_MS.length - 1)];
      const nextScheduledAt = new Date(Date.now() + backoffMs);
      await db.notification.update({
        where: { id: notification.id },
        data: {
          retryCount: nextRetryCount,
          scheduledAt: nextScheduledAt
        }
      });
      console.warn({
        event: 'notification_retry_scheduled',
        notificationId: notification.id,
        attempt: nextRetryCount,
        nextAttemptAt: nextScheduledAt.toISOString(),
        backoffMs
      });
    }
  }
}
