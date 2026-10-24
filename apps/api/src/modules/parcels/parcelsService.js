// Parcels module — CRUD + ownership history for land parcels.
// LandOfficer creates/updates parcels and current ownership; SystemAdmin can
// also manage. Citizens can only read their own parcels (handled by /me/parcels
// in a future milestone, not here). NFR-06: ACID transactions wrap parcel +
// ownership history + audit.

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit, auditView } from '../../middleware/auditMiddleware.js';
import { AuditAction } from '@prisma/client';
import { dispatchNotification } from '../notifications/notificationsService.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const PARCEL_NUMBER_RE = /^[A-Z0-9-]{3,30}$/;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  subCity: z.string().max(100).optional(),
  kebele: z.string().max(100).optional(),
  search: z.string().max(100).optional(),
  currentOwnerId: z.string().uuid().optional()
});

const createSchema = z.object({
  parcelNumber: z.string().regex(PARCEL_NUMBER_RE, 'parcelNumber must be 3–30 uppercase alphanumerics or hyphen'),
  currentOwnerNationalId: z.string().min(1).max(50),
  subCity: z.string().min(1).max(100),
  kebele: z.string().min(1).max(100),
  location: z.string().min(1).max(200),
  declaredSize: z.number().positive().max(1_000_000),
  sizeUnit: z.string().max(50).default('square_meters'),
  landUseType: z.string().min(1).max(100),
  boundaryJson: z.any().optional()
});

const patchSchema = z.object({
  subCity: z.string().min(1).max(100).optional(),
  kebele: z.string().min(1).max(100).optional(),
  location: z.string().min(1).max(200).optional(),
  declaredSize: z.number().positive().max(1_000_000).optional(),
  sizeUnit: z.string().max(50).optional(),
  landUseType: z.string().min(1).max(100).optional(),
  boundaryStatus: z.enum(['Pending', 'Verified', 'OverlapConflict', 'Rejected']).optional(),
  boundaryJson: z.any().optional(),
  expectedVersion: z.number().int().positive()
});

export async function listParcels({ query }) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { page, pageSize, subCity, kebele, search, currentOwnerId } = parsed.data;
  const where = {
    ...(subCity ? { subCity: { contains: subCity, mode: 'insensitive' } } : {}),
    ...(kebele ? { kebele: { contains: kebele, mode: 'insensitive' } } : {}),
    ...(currentOwnerId ? { currentOwnerId } : {}),
    ...(search
      ? {
          OR: [
            { parcelNumber: { contains: search, mode: 'insensitive' } },
            { location: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {})
  };
  const [items, total] = await Promise.all([
    db.landParcel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { currentOwner: true }
    }),
    db.landParcel.count({ where })
  ]);
  return { items: items.map(parcelDto), page, pageSize, total };
}

export async function getParcel({ id, request }) {
  const parcel = await db.landParcel.findUnique({
    where: { id },
    include: { currentOwner: true, properties: true, ownershipHistory: { include: { owner: true }, orderBy: { startedAt: 'desc' } } }
  });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  // NFR-07: audit all CRUD operations including views.
  await auditView(request, 'LandParcel', id, { parcelNumber: parcel.parcelNumber });
  return parcelDto(parcel, { withHistory: true, withProperties: true });
}

export async function createParcel({ input, request }) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const body = parsed.data;
  const owner = await db.ownerProfile.findUnique({ where: { nationalId: body.currentOwnerNationalId } });
  if (!owner) {
    throw new AppError(404, 'OWNER_NOT_FOUND', 'Owner profile with that national ID was not found. Create the owner profile first.');
  }

  // Duplicate parcel-number check (DATABASE_DESIGN.md business rule).
  const existing = await db.landParcel.findUnique({ where: { parcelNumber: body.parcelNumber } });
  if (existing) {
    throw new AppError(409, 'PARCEL_NUMBER_DUPLICATE', 'A parcel with that parcel number already exists.');
  }

  const certificateNumber = `CERT-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const created = await db.$transaction(async (tx) => {
    const parcel = await tx.landParcel.create({
      data: {
        parcelNumber: body.parcelNumber,
        currentOwnerId: owner.id,
        subCity: body.subCity,
        kebele: body.kebele,
        location: body.location,
        declaredSize: body.declaredSize,
        sizeUnit: body.sizeUnit,
        landUseType: body.landUseType,
        boundaryJson: body.boundaryJson ?? null,
        boundaryStatus: 'Pending'
      }
    });
    await tx.ownershipHistory.create({
      data: {
        parcelId: parcel.id,
        ownerId: owner.id,
        acquiredAt: new Date(),
        acquisitionMethod: 'initial_registration'
      }
    });
    // UC-02 step 9: "System generates a unique Parcel ID and a digital
    // certificate (PDF)." For the prototype the certificate row is created
    // atomically with the parcel; the PDF is generated on-demand at
    // POST /certificates/{id}/download (M5) which uses the qrPayload +
    // certificateNumber stored here.
    await tx.certificate.create({
      data: {
        parcelId: parcel.id,
        ownerId: owner.id,
        certificateNumber,
        status: 'Active',
        qrPayload: `DLPMS:${certificateNumber}`
      }
    });
    return parcel;
  });

  await writeAudit(request, AuditAction.Create, {
    entityType: 'LandParcel',
    entityId: created.id,
    newSnapshot: { parcelNumber: created.parcelNumber, currentOwnerId: created.currentOwnerId, certificateNumber }
  });
  await writeAudit(request, AuditAction.CertificateIssue, {
    entityType: 'Certificate',
    entityId: certificateNumber,
    newSnapshot: { parcelId: created.id, ownerId: owner.id, certificateNumber, origin: 'initial_registration' }
  });

  // Best-effort notification to the new owner.
  try {
    const ownerUser = await db.ownerProfile.findUnique({
      where: { id: owner.id },
      select: { userId: true, fullName: true }
    });
    if (ownerUser?.userId) {
      await dispatchNotification({
        recipientUserId: ownerUser.userId,
        channel: 'sms',
        templateKey: 'parcel.registered',
        payload: { parcelId: created.id, parcelNumber: created.parcelNumber, certificateNumber },
        scheduledAt: new Date()
      });
    }
  } catch (error) {
    console.error({ event: 'parcel_registration_notification_failed', parcelId: created.id, error: error.message });
  }

  const full = await db.landParcel.findUnique({ where: { id: created.id }, include: { currentOwner: true } });
  return parcelDto(full);
}

export async function patchParcel({ id, input, request }) {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { expectedVersion, ...updates } = parsed.data;
  const cleaned = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  if (Object.keys(cleaned).length === 0) {
    throw new AppError(400, 'EMPTY_PATCH', 'No updateable fields supplied.');
  }

  const current = await db.landParcel.findUnique({ where: { id } });
  if (!current) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  // Optimistic concurrency — SECURITY_DESIGN.md / DATABASE_DESIGN.md.
  if (current.version !== expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'The parcel was modified by another request.', {
      currentVersion: current.version,
      expectedVersion
    });
  }

  const oldSnapshot = {
    subCity: current.subCity,
    kebele: current.kebele,
    location: current.location,
    declaredSize: current.declaredSize,
    landUseType: current.landUseType,
    boundaryStatus: current.boundaryStatus
  };

  const updated = await db.landParcel.update({
    where: { id },
    data: { ...cleaned, version: { increment: 1 } },
    include: { currentOwner: true }
  });

  await writeAudit(request, AuditAction.Update, {
    entityType: 'LandParcel',
    entityId: id,
    oldSnapshot,
    newSnapshot: cleaned
  });

  return parcelDto(updated);
}

export async function listOwnershipHistory({ id, request }) {
  const parcel = await db.landParcel.findUnique({
    where: { id },
    include: {
      ownershipHistory: {
        orderBy: { startedAt: 'desc' },
        include: { owner: true }
      }
    }
  });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  // NFR-07: audit the view.
  await auditView(request, 'LandParcel', id, { view: 'ownership-history' });
  return {
    parcelId: parcel.id,
    parcelNumber: parcel.parcelNumber,
    history: parcel.ownershipHistory.map((h) => ({
      id: h.id,
      owner: {
        id: h.owner.id,
        fullName: h.owner.fullName,
        nationalId: h.owner.nationalId
      },
      acquiredAt: h.acquiredAt,
      acquisitionMethod: h.acquisitionMethod,
      startedAt: h.startedAt,
      endedAt: h.endedAt,
      sourceTransferId: h.sourceTransferId
    }))
  };
}

function parcelDto(parcel, { withHistory = false, withProperties = false } = {}) {
  return {
    id: parcel.id,
    parcelNumber: parcel.parcelNumber,
    currentOwner: parcel.currentOwner
      ? {
          id: parcel.currentOwner.id,
          fullName: parcel.currentOwner.fullName,
          nationalId: parcel.currentOwner.nationalId
        }
      : null,
    subCity: parcel.subCity,
    kebele: parcel.kebele,
    location: parcel.location,
    declaredSize: parcel.declaredSize,
    sizeUnit: parcel.sizeUnit,
    landUseType: parcel.landUseType,
    boundaryStatus: parcel.boundaryStatus,
    boundaryJson: parcel.boundaryJson ?? null,
    version: parcel.version,
    createdAt: parcel.createdAt,
    updatedAt: parcel.updatedAt,
    ...(withProperties && parcel.properties
      ? { properties: parcel.properties.map((p) => ({ id: p.id, propertyType: p.propertyType })) }
      : {}),
    ...(withHistory && parcel.ownershipHistory
      ? {
          ownershipHistory: parcel.ownershipHistory.map((h) => ({
            id: h.id,
            owner: { id: h.owner.id, fullName: h.owner.fullName, nationalId: h.owner.nationalId },
            acquiredAt: h.acquiredAt,
            acquisitionMethod: h.acquisitionMethod,
            startedAt: h.startedAt,
            endedAt: h.endedAt
          }))
        }
      : {})
  };
}
