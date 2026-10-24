// GIS module — implements boundary management per API_DESIGN.md and
// WORKFLOWS.md §5. Per PROJECT_DECISIONS.md, the production schema uses
// PostGIS geometry(Polygon, 4326) with a GiST index and ST_Intersects for
// overlap detection.
//
// M13 (Supabase): now using real PostGIS 3.3.7 on Supabase. The `boundary_geom`
// column (geometry(Polygon, 4326)) is synced from `boundaryJson` (GeoJSON
// source of truth) on every boundary write. Overlap detection uses ST_Intersects
// with the GiST index for O(log n) performance.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, BoundaryStatus } from '@prisma/client';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  subCity: z.string().max(100).optional(),
  kebele: z.string().max(100).optional(),
  boundaryStatus: z.nativeEnum(BoundaryStatus).optional()
});

// GeoJSON Polygon: { type: 'Polygon', coordinates: [ [ [lng,lat], ... ] ] }
const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()).length(2)).min(4))
});

const putBoundarySchema = z.object({
  geometry: polygonSchema,
  expectedVersion: z.number().int().positive()
});

const importSchema = z.object({
  features: z.array(
    z.object({
      parcelId: z.string().uuid(),
      geometry: polygonSchema
    })
  ).min(1).max(100)
});

export async function listGisParcels({ query }) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { page, pageSize, subCity, kebele, boundaryStatus } = parsed.data;
  const where = {
    ...(subCity ? { subCity: { contains: subCity, mode: 'insensitive' } } : {}),
    ...(kebele ? { kebele: { contains: kebele, mode: 'insensitive' } } : {}),
    ...(boundaryStatus ? { boundaryStatus } : {})
  };
  const [items, total] = await Promise.all([
    db.landParcel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, parcelNumber: true, subCity: true, kebele: true,
        boundaryStatus: true, boundaryJson: true, version: true, updatedAt: true
      }
    }),
    db.landParcel.count({ where })
  ]);
  return { items, page, pageSize, total };
}

export async function getParcelBoundary({ id }) {
  const parcel = await db.landParcel.findUnique({
    where: { id },
    select: { id: true, parcelNumber: true, boundaryJson: true, boundaryStatus: true, version: true, updatedAt: true }
  });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  return {
    id: parcel.id,
    parcelNumber: parcel.parcelNumber,
    geometry: parcel.boundaryJson,
    boundaryStatus: parcel.boundaryStatus,
    version: parcel.version,
    updatedAt: parcel.updatedAt
  };
}

export async function putBoundary({ id, input, request }) {
  const parsed = putBoundarySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const parcel = await db.landParcel.findUnique({ where: { id } });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  if (parcel.version !== parsed.data.expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: parcel.version,
      expectedVersion: parsed.data.expectedVersion
    });
  }
  const updated = await db.landParcel.update({
    where: { id },
    data: {
      boundaryJson: parsed.data.geometry,
      boundaryStatus: 'Pending', // pending until /verify runs
      version: { increment: 1 }
    }
  });
  // Sync the GeoJSON into the PostGIS geometry column via ST_GeomFromGeoJSON
  await db.$executeRaw`UPDATE land_parcels SET boundary_geom = ST_GeomFromGeoJSON(${JSON.stringify(parsed.data.geometry)}) WHERE id = ${id}`;
  await writeAudit(request, AuditAction.Update, {
    entityType: 'LandParcel',
    entityId: id,
    oldSnapshot: { boundaryStatus: parcel.boundaryStatus, hadGeometry: Boolean(parcel.boundaryJson) },
    newSnapshot: { boundaryStatus: 'Pending', geometryType: 'Polygon' }
  });
  return {
    id: updated.id,
    parcelNumber: updated.parcelNumber,
    geometry: updated.boundaryJson,
    boundaryStatus: updated.boundaryStatus,
    version: updated.version
  };
}

export async function verifyBoundary({ id, request }) {
  const parcel = await db.landParcel.findUnique({ where: { id } });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  if (!parcel.boundaryJson) {
    throw new AppError(400, 'NO_BOUNDARY', 'Parcel has no boundary geometry. PUT /gis/parcels/{id}/boundary first.');
  }
  // PostGIS ST_Intersects — O(log n) via GiST index, far faster than the
  // previous in-process pairwise polygon math.
  const overlaps = await db.$queryRaw`
    SELECT id AS "parcelId", "parcelNumber", "subCity", kebele
    FROM land_parcels
    WHERE id != ${id}
      AND boundary_geom IS NOT NULL
      AND ST_Intersects(boundary_geom, (
        SELECT boundary_geom FROM land_parcels WHERE id = ${id}
      ))
  `;
  const newStatus = overlaps.length === 0 ? 'Verified' : 'OverlapConflict';
  const updated = await db.landParcel.update({
    where: { id },
    data: { boundaryStatus: newStatus, version: { increment: 1 } }
  });
  await writeAudit(request, AuditAction.BoundaryVerify, {
    entityType: 'LandParcel',
    entityId: id,
    oldSnapshot: { boundaryStatus: parcel.boundaryStatus },
    newSnapshot: { boundaryStatus: newStatus, overlapsDetected: overlaps.length }
  });
  return {
    id: updated.id,
    parcelNumber: updated.parcelNumber,
    boundaryStatus: updated.boundaryStatus,
    overlapsDetected: overlaps.length,
    overlaps
  };
}

export async function importBoundaries({ input, request }) {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const results = [];
  for (const feat of parsed.data.features) {
    const parcel = await db.landParcel.findUnique({ where: { id: feat.parcelId } });
    if (!parcel) {
      results.push({ parcelId: feat.parcelId, ok: false, error: 'Parcel not found.' });
      continue;
    }
    await db.landParcel.update({
      where: { id: feat.parcelId },
      data: {
        boundaryJson: feat.geometry,
        boundaryStatus: 'Pending',
        version: { increment: 1 }
      }
    });
    // Sync to PostGIS geometry column
    await db.$executeRaw`UPDATE land_parcels SET boundary_geom = ST_GeomFromGeoJSON(${JSON.stringify(feat.geometry)}) WHERE id = ${feat.parcelId}`;
    await writeAudit(request, AuditAction.Update, {
      entityType: 'LandParcel',
      entityId: feat.parcelId,
      oldSnapshot: { boundaryStatus: parcel.boundaryStatus },
      newSnapshot: { boundaryStatus: 'Pending', source: 'gis_import' }
    });
    results.push({ parcelId: feat.parcelId, ok: true, status: 'Pending' });
  }
  return { imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

export async function listOverlaps({ query }) {
  // PostGIS ST_Intersects self-join — one SQL query instead of O(n²) in-process scan.
  const limit = Math.min(Number(query?.limit ?? 100), 500);
  const overlaps = await db.$queryRaw`
    WITH bounded AS (
      SELECT id, "parcelNumber", "subCity", kebele, boundary_geom
      FROM land_parcels
      WHERE boundary_geom IS NOT NULL
      LIMIT ${limit}
    )
    SELECT
      a.id AS a_id, a."parcelNumber" AS a_parcel, a."subCity" AS a_sub, a.kebele AS a_kebele,
      b.id AS b_id, b."parcelNumber" AS b_parcel, b."subCity" AS b_sub, b.kebele AS b_kebele
    FROM bounded a
    CROSS JOIN bounded b
    WHERE a.id < b.id
      AND ST_Intersects(a.boundary_geom, b.boundary_geom)
  `;
  const items = overlaps.map(r => ({
    a: { id: r.a_id, parcelNumber: r.a_parcel, subCity: r.a_sub, kebele: r.a_kebele },
    b: { id: r.b_id, parcelNumber: r.b_parcel, subCity: r.b_sub, kebele: r.b_kebele }
  }));
  return { scanned: limit, overlaps: items.length, items };
}

// ---------------------------------------------------------------------------
// Polygon overlap helpers (in-process, sufficient for prototype).
// ---------------------------------------------------------------------------

function polygonRingToPoints(geojson) {
  const coords = geojson?.coordinates?.[0] ?? [];
  return coords.map(([lng, lat]) => ({ x: lng, y: lat }));
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

function direction(a, b, c) {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

function onSegment(p, q, r) {
  return Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) &&
         Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
}

function pointInPolygon(point, polyPoints) {
  let inside = false;
  for (let i = 0, j = polyPoints.length - 1; i < polyPoints.length; j = i++) {
    const xi = polyPoints[i].x, yi = polyPoints[i].y;
    const xj = polyPoints[j].x, yj = polyPoints[j].y;
    const intersect = (yi > point.y) !== (yj > point.y) &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonsOverlap(a, b) {
  const ringA = polygonRingToPoints(a);
  const ringB = polygonRingToPoints(b);
  if (ringA.length < 4 || ringB.length < 4) return false; // a ring needs at least 4 points (closed)
  // Edge intersection test
  for (let i = 0; i < ringA.length - 1; i++) {
    for (let j = 0; j < ringB.length - 1; j++) {
      if (segmentsIntersect(ringA[i], ringA[i + 1], ringB[j], ringB[j + 1])) {
        return true;
      }
    }
  }
  // Containment test (one inside the other)
  if (pointInPolygon(ringA[0], ringB)) return true;
  if (pointInPolygon(ringB[0], ringA)) return true;
  return false;
}
