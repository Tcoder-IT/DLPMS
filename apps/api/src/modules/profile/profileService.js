// Profile module — GET/PATCH /me. Citizens can read and update their own
// owner profile and account preferences. SECURITY_DESIGN.md: server-side
// ownership checks for the resource.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction } from '@prisma/client';

const patchSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  physicalAddress: z.string().min(1).max(500).optional(),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().max(254).optional(),
  preferredLanguage: z.enum(['en', 'am']).optional()
});

export async function getMyProfile({ request }) {
  const user = await db.user.findUnique({
    where: { id: request.user.id },
    include: { role: true, ownerProfile: true }
  });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'Profile not found.');
  }
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    email: user.email ?? null,
    role: user.role?.code ?? null,
    preferredLanguage: user.preferredLanguage,
    active: user.active,
    ownerProfile: user.ownerProfile
      ? {
          id: user.ownerProfile.id,
          fullName: user.ownerProfile.fullName,
          nationalId: user.ownerProfile.nationalId,
          physicalAddress: user.ownerProfile.physicalAddress,
          contactPhone: user.ownerProfile.contactPhone,
          contactEmail: user.ownerProfile.contactEmail
        }
      : null
  };
}

export async function patchMyProfile({ input, request }) {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const user = await db.user.findUnique({
    where: { id: request.user.id },
    include: { ownerProfile: true }
  });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'Profile not found.');
  }

  const { preferredLanguage, ...profileFields } = parsed.data;
  const userUpdates = preferredLanguage ? { preferredLanguage } : {};
  const profileUpdates = Object.fromEntries(
    Object.entries(profileFields).filter(([, v]) => v !== undefined)
  );

  const oldSnapshot = user.ownerProfile
    ? {
        fullName: user.ownerProfile.fullName,
        physicalAddress: user.ownerProfile.physicalAddress,
        contactPhone: user.ownerProfile.contactPhone,
        contactEmail: user.ownerProfile.contactEmail
      }
    : null;

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...userUpdates,
      ...(user.ownerProfile && Object.keys(profileUpdates).length
        ? { ownerProfile: { update: { ...profileUpdates, version: { increment: 1 } } } }
        : {})
    },
    include: { role: true, ownerProfile: true }
  });

  await writeAudit(request, AuditAction.Update, {
    entityType: 'OwnerProfile',
    entityId: updated.ownerProfile?.id ?? user.id,
    oldSnapshot,
    newSnapshot: profileUpdates
  });

  return {
    id: updated.id,
    phoneNumber: updated.phoneNumber,
    email: updated.email ?? null,
    role: updated.role?.code ?? null,
    preferredLanguage: updated.preferredLanguage,
    active: updated.active,
    ownerProfile: updated.ownerProfile
      ? {
          id: updated.ownerProfile.id,
          fullName: updated.ownerProfile.fullName,
          nationalId: updated.ownerProfile.nationalId,
          physicalAddress: updated.ownerProfile.physicalAddress,
          contactPhone: updated.ownerProfile.contactPhone,
          contactEmail: updated.ownerProfile.contactEmail,
          version: updated.ownerProfile.version
        }
      : null
  };
}
