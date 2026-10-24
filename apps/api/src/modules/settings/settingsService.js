// Settings module — FR-27: "Configure system parameters including tax rates,
// fees, and notification templates." Restricted to SystemAdmin; all changes
// are audited. Per SECURITY_DESIGN.md "Configure tax rates, fees, and
// notification templates" and "elevated actions are audited."
//
// The SystemSetting table was created in M3 but had no admin endpoints.
// This module exposes:
//   - GET /admin/settings                  (list all settings)
//   - GET /admin/settings/:key             (fetch a single setting)
//   - PATCH /admin/settings/:key           (update a setting's value/description)
//
// Setting keys are documented in MILESTONE.md:
//   - tax.rate_per_sqm_etb              (Tax rate per square meter per year, ETB)
//   - tax.surcharge_factor              (Multiplier applied to base tax)
//   - appointment.cancellation_window_hours (Minimum hours before appt to cancel)
//   - notification.template.{key}       (Per-template localized body — future)

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, RoleCode } from '@prisma/client';

const KEY_PATTERN = /^[a-z][a-z0-9._-]{2,99}$/i;

const patchSchema = z.object({
  value: z.record(z.string(), z.unknown()),
  description: z.string().max(500).optional()
});

export async function listSettings({ request }) {
  if (request.role?.code !== RoleCode.SystemAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Settings are restricted to System Administrators.');
  }
  const settings = await db.systemSetting.findMany({
    orderBy: { key: 'asc' }
  });
  // Audit the list view (NFR-07).
  await writeAudit(request, AuditAction.View, {
    entityType: 'SystemSetting',
    entityId: null,
    newSnapshot: { count: settings.length, viewedAt: new Date().toISOString() }
  });
  return { items: settings, total: settings.length };
}

export async function getSetting({ key, request }) {
  if (request.role?.code !== RoleCode.SystemAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Settings are restricted to System Administrators.');
  }
  const setting = await db.systemSetting.findUnique({ where: { key } });
  if (!setting) {
    throw new AppError(404, 'NOT_FOUND', `Setting '${key}' not found.`);
  }
  await writeAudit(request, AuditAction.View, {
    entityType: 'SystemSetting',
    entityId: key,
    newSnapshot: { viewedAt: new Date().toISOString() }
  });
  return setting;
}

export async function updateSetting({ key, input, request }) {
  if (request.role?.code !== RoleCode.SystemAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Settings are restricted to System Administrators.');
  }
  if (!KEY_PATTERN.test(key)) {
    throw new AppError(400, 'INVALID_KEY', 'Setting key must be 3-100 chars matching [a-zA-Z0-9._-].');
  }
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const existing = await db.systemSetting.findUnique({ where: { key } });
  const data = {
    key,
    value: parsed.data.value,
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    updatedById: request.user.id
  };
  const updated = await db.systemSetting.upsert({
    where: { key },
    create: data,
    update: data
  });
  await writeAudit(request, AuditAction.SettingsUpdate, {
    entityType: 'SystemSetting',
    entityId: key,
    oldSnapshot: existing ? { value: existing.value, description: existing.description } : null,
    newSnapshot: { value: parsed.data.value, description: parsed.data.description ?? existing?.description ?? null }
  });
  return updated;
}
