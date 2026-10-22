// Appointments module — implements WORKFLOWS.md §6 (appointment booking,
// reschedule, cancellation, slot management) and FR-36 (24-hour reminder
// scheduling handled in notificationsService scheduler).
//
// SECURITY_DESIGN.md: server-side ownership checks — Citizens see only their
// own appointments; officers see those assigned to them; SystemAdmin sees all.
// Real-time slot availability check at booking time to prevent double-booking.
// Cancellation window is configurable (SystemSetting) — the PDF does not
// define a duration.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, AppointmentStatus, RoleCode } from '@prisma/client';
import { dispatchNotification } from '../notifications/notificationsService.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SLOT_DURATION_MIN = 5; // minimum slot length
const SLOT_DURATION_MAX = 240; // maximum slot length (4 hours)

const DEFAULT_CANCELLATION_WINDOW_HOURS = 2; // AGENTS.md: configurable, not hard-coded business policy

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  status: z.nativeEnum(AppointmentStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  officerId: z.string().uuid().optional()
});

const bookSchema = z.object({
  officerId: z.string().uuid(),
  slotId: z.string().uuid().optional(),
  serviceType: z.string().min(1).max(100),
  scheduledAt: z.string().datetime(),
  purpose: z.string().max(1000).optional()
});

const rescheduleSchema = z.object({
  newScheduledAt: z.string().datetime(),
  expectedVersion: z.number().int().positive()
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(1000),
  expectedVersion: z.number().int().positive()
});

const slotCreateSchema = z.object({
  officerId: z.string().uuid(),
  serviceType: z.string().min(1).max(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  capacity: z.coerce.number().int().min(1).max(50).default(1)
});

const slotListSchema = z.object({
  officerId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  active: z.enum(['true', 'false']).optional()
});

async function getCancellationWindowHours() {
  // Configurable cancellation window — AGENTS.md: do not assume a duration.
  const setting = await db.systemSetting.findUnique({ where: { key: 'appointment.cancellation_window_hours' } });
  if (setting) {
    const hours = Number(setting.value?.hours ?? DEFAULT_CANCELLATION_WINDOW_HOURS);
    if (Number.isFinite(hours) && hours >= 0) return hours;
  }
  return DEFAULT_CANCELLATION_WINDOW_HOURS;
}

export async function listAppointments({ query, request }) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { page, pageSize, status, from, to, officerId } = parsed.data;
  const roleCode = request.role?.code;
  const ownerId = request.user.ownerProfile?.id;

  // Per SECURITY_DESIGN.md: server-side ownership.
  const where = {
    ...(status ? { status } : {}),
    ...(from || to ? { scheduledAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(officerId ? { officerId } : {}),
    ...(roleCode === RoleCode.Citizen
      ? { citizenOwnerId: ownerId ?? '00000000-0000-0000-0000-000000000000' }
      : roleCode === RoleCode.LandOfficer
      ? { officerId: request.user.id }
      : {})
  };
  const [items, total] = await Promise.all([
    db.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { citizen: true, officer: { include: { role: true } }, slot: true }
    }),
    db.appointment.count({ where })
  ]);
  return { items: items.map(appointmentDto), page, pageSize, total };
}

export async function getAppointment({ id, request }) {
  const appt = await db.appointment.findUnique({
    where: { id },
    include: { citizen: true, officer: { include: { role: true } }, slot: true }
  });
  if (!appt) {
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
  }
  // Ownership check
  const roleCode = request.role?.code;
  if (roleCode === RoleCode.Citizen && appt.citizenOwnerId !== request.user.ownerProfile?.id) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this appointment.');
  }
  if (roleCode === RoleCode.LandOfficer && appt.officerId !== request.user.id) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this appointment.');
  }
  return appointmentDto(appt, { withRelations: true });
}

export async function bookAppointment({ input, request }) {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const roleCode = request.role?.code;
  if (roleCode !== RoleCode.Citizen && roleCode !== RoleCode.SystemAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Only citizens may book appointments.');
  }
  const ownerId = request.user.ownerProfile?.id;
  if (!ownerId) {
    throw new AppError(403, 'FORBIDDEN', 'Your account has no owner profile; cannot book.');
  }
  const officer = await db.user.findUnique({
    where: { id: parsed.data.officerId },
    include: { role: true }
  });
  if (!officer || !officer.active) {
    throw new AppError(404, 'OFFICER_NOT_FOUND', 'Officer not found or inactive.');
  }
  if (officer.role.code !== RoleCode.LandOfficer) {
    throw new AppError(400, 'NOT_OFFICER', 'The selected user is not a Land Officer.');
  }
  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (scheduledAt.getTime() < Date.now()) {
    throw new AppError(400, 'PAST_TIME', 'Cannot book an appointment in the past.');
  }

  // WORKFLOWS.md §6 step 2: real-time availability recheck to prevent double-booking.
  const slotWindowStart = new Date(scheduledAt.getTime() - 30 * 60 * 1000);
  const slotWindowEnd = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
  const conflicting = await db.appointment.findFirst({
    where: {
      officerId: officer.id,
      scheduledAt: { gte: slotWindowStart, lte: slotWindowEnd },
      status: AppointmentStatus.Scheduled
    }
  });
  if (conflicting) {
    throw new AppError(409, 'SLOT_TAKEN', 'The selected time is no longer available.');
  }

  const created = await db.appointment.create({
    data: {
      citizenOwnerId: ownerId,
      officerId: officer.id,
      slotId: parsed.data.slotId ?? null,
      serviceType: parsed.data.serviceType,
      scheduledAt,
      status: AppointmentStatus.Scheduled,
      purpose: parsed.data.purpose ?? null
    },
    include: { citizen: true, officer: { include: { role: true } } }
  });

  await writeAudit(request, AuditAction.AppointmentBook, {
    entityType: 'Appointment',
    entityId: created.id,
    newSnapshot: { officerId: officer.id, scheduledAt: scheduledAt.toISOString(), serviceType: created.serviceType }
  });

  // Send SMS confirmation + schedule 24-hour reminder (FR-36; notifications module).
  try {
    await dispatchNotification({
      recipientUserId: request.user.id,
      channel: 'sms',
      templateKey: 'appointment.booked',
      payload: { appointmentId: created.id, scheduledAt: scheduledAt.toISOString(), serviceType: created.serviceType },
      scheduledAt: new Date() // immediate
    });
    await dispatchNotification({
      recipientUserId: request.user.id,
      channel: 'sms',
      templateKey: 'appointment.reminder_24h',
      payload: { appointmentId: created.id, scheduledAt: scheduledAt.toISOString() },
      scheduledAt: new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000) // 24h before
    });
  } catch (error) {
    // Don't fail the booking if notification dispatch fails; just log.
    console.error({ event: 'appointment_notification_failed', appointmentId: created.id, error: error.message });
  }

  return appointmentDto(created, { withRelations: true });
}

export async function rescheduleAppointment({ id, input, request }) {
  const parsed = rescheduleSchema.parse(input);
  const appt = await db.appointment.findUnique({ where: { id } });
  if (!appt) {
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
  }
  // Ownership check
  const roleCode = request.role?.code;
  if (roleCode === RoleCode.Citizen && appt.citizenOwnerId !== request.user.ownerProfile?.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only reschedule your own appointments.');
  }
  if (appt.status !== AppointmentStatus.Scheduled) {
    throw new AppError(409, 'NOT_RESCHEDULABLE', `Cannot reschedule an appointment in status ${appt.status}.`);
  }
  if (appt.version !== parsed.data.expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: appt.version,
      expectedVersion: parsed.data.expectedVersion
    });
  }
  const newTime = new Date(parsed.data.newScheduledAt);
  if (newTime.getTime() < Date.now()) {
    throw new AppError(400, 'PAST_TIME', 'Cannot reschedule to a time in the past.');
  }
  // Slot double-book recheck
  const slotWindowStart = new Date(newTime.getTime() - 30 * 60 * 1000);
  const slotWindowEnd = new Date(newTime.getTime() + 30 * 60 * 1000);
  const conflicting = await db.appointment.findFirst({
    where: {
      id: { not: id },
      officerId: appt.officerId,
      scheduledAt: { gte: slotWindowStart, lte: slotWindowEnd },
      status: AppointmentStatus.Scheduled
    }
  });
  if (conflicting) {
    throw new AppError(409, 'SLOT_TAKEN', 'The new time is no longer available.');
  }

  const updated = await db.appointment.update({
    where: { id },
    data: { scheduledAt: newTime, version: { increment: 1 } },
    include: { citizen: true, officer: { include: { role: true } } }
  });
  await writeAudit(request, AuditAction.AppointmentReschedule, {
    entityType: 'Appointment',
    entityId: id,
    oldSnapshot: { scheduledAt: appt.scheduledAt },
    newSnapshot: { scheduledAt: newTime.toISOString() }
  });
  return appointmentDto(updated, { withRelations: true });
}

export async function cancelAppointment({ id, input, request }) {
  const parsed = cancelSchema.parse(input);
  const appt = await db.appointment.findUnique({ where: { id } });
  if (!appt) {
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
  }
  const roleCode = request.role?.code;
  if (roleCode === RoleCode.Citizen && appt.citizenOwnerId !== request.user.ownerProfile?.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only cancel your own appointments.');
  }
  if (appt.status !== AppointmentStatus.Scheduled) {
    throw new AppError(409, 'NOT_CANCELLABLE', `Cannot cancel an appointment in status ${appt.status}.`);
  }
  if (appt.version !== parsed.data.expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: appt.version,
      expectedVersion: parsed.data.expectedVersion
    });
  }
  // Configurable cancellation window (PROJECT_DECISIONS.md: appointment window is not specified).
  const windowHours = await getCancellationWindowHours();
  const msUntilAppt = appt.scheduledAt.getTime() - Date.now();
  if (msUntilAppt < windowHours * 60 * 60 * 1000) {
    throw new AppError(409, 'OUTSIDE_CANCELLATION_WINDOW', `Appointments must be cancelled at least ${windowHours} hours in advance.`);
  }

  const updated = await db.appointment.update({
    where: { id },
    data: { status: AppointmentStatus.Cancelled, cancellationReason: parsed.data.reason, version: { increment: 1 } },
    include: { citizen: true, officer: { include: { role: true } } }
  });
  await writeAudit(request, AuditAction.AppointmentCancel, {
    entityType: 'Appointment',
    entityId: id,
    oldSnapshot: { status: appt.status },
    newSnapshot: { status: 'Cancelled', reason: parsed.data.reason }
  });
  return appointmentDto(updated, { withRelations: true });
}

// ---------------------------------------------------------------------------
// Slot management — LandOfficer/SystemAdmin
// ---------------------------------------------------------------------------

export async function listSlots({ query, request }) {
  const parsed = slotListSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { officerId, from, to, active } = parsed.data;
  const roleCode = request.role?.code;
  const where = {
    ...(officerId ? { officerId } : {}),
    ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(active !== undefined ? { active: active === 'true' } : {}),
    // LandOfficers see only their own slots
    ...(roleCode === RoleCode.LandOfficer ? { officerId: request.user.id } : {})
  };
  const slots = await db.appointmentSlot.findMany({
    where,
    orderBy: { startsAt: 'asc' },
    include: { appointments: { where: { status: AppointmentStatus.Scheduled } } }
  });
  return {
    items: slots.map((s) => ({
      id: s.id,
      officerId: s.officerId,
      serviceType: s.serviceType,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      capacity: s.capacity,
      active: s.active,
      bookedCount: s.appointments?.length ?? 0
    }))
  };
}

export async function createSlot({ input, request }) {
  const parsed = slotCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (endsAt <= startsAt) {
    throw new AppError(400, 'INVALID_RANGE', 'endsAt must be after startsAt.');
  }
  const durationMin = (endsAt.getTime() - startsAt.getTime()) / 60000;
  if (durationMin < SLOT_DURATION_MIN || durationMin > SLOT_DURATION_MAX) {
    throw new AppError(400, 'INVALID_DURATION', `Slot duration must be between ${SLOT_DURATION_MIN} and ${SLOT_DURATION_MAX} minutes.`);
  }
  const officer = await db.user.findUnique({ where: { id: parsed.data.officerId }, include: { role: true } });
  if (!officer || !officer.active || officer.role.code !== RoleCode.LandOfficer) {
    throw new AppError(400, 'NOT_OFFICER', 'The selected user is not an active Land Officer.');
  }
  // Unique constraint: (officerId, startsAt, endsAt) — DB will reject duplicates.
  try {
    const slot = await db.appointmentSlot.create({
      data: {
        officerId: officer.id,
        serviceType: parsed.data.serviceType,
        startsAt,
        endsAt,
        capacity: parsed.data.capacity
      }
    });
    await writeAudit(request, AuditAction.Create, {
      entityType: 'AppointmentSlot',
      entityId: slot.id,
      newSnapshot: { officerId: officer.id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), capacity: parsed.data.capacity }
    });
    return slot;
  } catch (error) {
    if (error?.code === 'P2002') {
      throw new AppError(409, 'SLOT_EXISTS', 'An identical slot already exists for this officer.');
    }
    throw error;
  }
}

function appointmentDto(appt, { withRelations = false } = {}) {
  return {
    id: appt.id,
    citizenOwnerId: appt.citizenOwnerId,
    citizen: withRelations && appt.citizen
      ? { id: appt.citizen.id, fullName: appt.citizen.fullName, nationalId: appt.citizen.nationalId }
      : null,
    officerId: appt.officerId,
    officer: withRelations && appt.officer
      ? { id: appt.officer.id, phoneNumber: appt.officer.phoneNumber, role: appt.officer.role?.code ?? null }
      : null,
    slotId: appt.slotId,
    serviceType: appt.serviceType,
    scheduledAt: appt.scheduledAt,
    status: appt.status,
    purpose: appt.purpose,
    cancellationReason: appt.cancellationReason,
    version: appt.version,
    createdAt: appt.createdAt,
    updatedAt: appt.updatedAt
  };
}
