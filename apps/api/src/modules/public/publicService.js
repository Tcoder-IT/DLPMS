// Public search module — FR-10: "Search public land records by parcel ID,
// owner name, or location." Per PROJECT_DECISIONS.md: "Public search —
// Which fields are public, whether owner name is truly public, consent/legal
// basis, result granularity, rate limits, and anti-enumeration rules. Until
// decided, expose no private ownership/document data."
//
// This implementation takes the conservative path: search by parcel ID + sub-city
// + kebele + location only. The response excludes the owner name and national ID
// entirely (the parcel's existence is public record; ownership is NOT).
//
// Rate-limited per NFR/security best practice. All searches are audited as
// PublicSearch entries (no actorUserId since the endpoint is unauthenticated —
// IP address is captured for forensic use).

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAuditEntry } from '../../lib/auditLog.js';
import { AuditAction } from '@prisma/client';

const searchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
  parcelNumber: z.string().max(50).optional(),
  subCity: z.string().max(100).optional(),
  kebele: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20) // smaller cap than authed list endpoints
});

export async function searchPublicParcels({ query, request }) {
  const parsed = searchSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { q, parcelNumber, subCity, kebele, location, page, pageSize } = parsed.data;

  // Build the where clause. `q` is a free-text search across the public
  // string fields; the specific filters (parcelNumber, subCity, kebele,
  // location) are applied when provided.
  const where = {
    AND: [
      ...(parcelNumber ? [{ parcelNumber: { contains: parcelNumber, mode: 'insensitive' } }] : []),
      ...(subCity ? [{ subCity: { contains: subCity, mode: 'insensitive' } }] : []),
      ...(kebele ? [{ kebele: { contains: kebele, mode: 'insensitive' } }] : []),
      ...(location ? [{ location: { contains: location, mode: 'insensitive' } }] : []),
      ...(q ? [{
        OR: [
          { parcelNumber: { contains: q, mode: 'insensitive' } },
          { subCity: { contains: q, mode: 'insensitive' } },
          { kebele: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } }
        ]
      }] : [])
    ]
  };

  const [items, total] = await Promise.all([
    db.landParcel.findMany({
      where,
      orderBy: { parcelNumber: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // PUBLIC FIELDS ONLY per PROJECT_DECISIONS.md — no owner, no national ID,
      // no contact info, no tax records, no boundary geometry.
      select: {
        id: true,
        parcelNumber: true,
        subCity: true,
        kebele: true,
        location: true,
        declaredSize: true,
        sizeUnit: true,
        landUseType: true,
        boundaryStatus: true,
        createdAt: true
      }
    }),
    db.landParcel.count({ where })
  ]);

  // Audit the public search (unauthenticated; capture IP for forensics).
  try {
    await writeAuditEntry({
      actorUserId: null, // public endpoint
      action: AuditAction.PublicSearch,
      entityType: 'LandParcel',
      entityId: null,
      requestId: request.id,
      ipAddress:
        request.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.socket?.remoteAddress ??
        null,
      newSnapshot: {
        q: q ?? null,
        parcelNumber: parcelNumber ?? null,
        subCity: subCity ?? null,
        kebele: kebele ?? null,
        location: location ?? null,
        page,
        pageSize,
        resultCount: total
      }
    });
  } catch (error) {
    // Audit failure must not block a public response.
    console.error({ event: 'public_search_audit_failed', error: error.message });
  }

  return {
    items: items.map((p) => ({
      id: p.id,
      parcelNumber: p.parcelNumber,
      subCity: p.subCity,
      kebele: p.kebele,
      location: p.location,
      declaredSize: p.declaredSize.toString(),
      sizeUnit: p.sizeUnit,
      landUseType: p.landUseType,
      boundaryStatus: p.boundaryStatus,
      registeredAt: p.createdAt.toISOString()
    })),
    page,
    pageSize,
    total,
    // Privacy notice in every response so the consumer is clear on the data policy.
    privacyNotice: 'Per PROJECT_DECISIONS.md, public search returns only parcel metadata. ' +
      'Owner name, national ID, contact info, tax records, ownership history, and boundary ' +
      'geometry are NOT exposed through this endpoint.'
  };
}
