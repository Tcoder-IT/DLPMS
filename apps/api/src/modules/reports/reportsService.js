// Reports module — PDF §4.3 sub-system 6 (Audit and Reporting Sub-System):
// "The report generator produces land registration summaries, transfer
// reports, tax collection summaries, and operational statistics in both PDF
// and CSV formats, with support for filtering by date range, sub-city, and
// officer."
//
// Implements:
//   - GET /reports/registrations    (FR-15 part 1: land registrations)
//   - GET /reports/transfers        (FR-15 part 2: transfers)
//   - GET /reports/tax-compliance    (FR-21: by period and sub-city)
//   - GET /reports/operations        (operational statistics)
//
// All endpoints accept `from`, `to`, `subCity` query filters per the PDF.
// All return JSON; CSV export is via the `?format=csv` query param.
// Reports are role-restricted: LandOfficer/SystemAdmin see registrations +
// transfers; TaxOfficial/SystemAdmin see tax-compliance; SystemAdmin sees
// operations. All report views are audited.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, RoleCode } from '@prisma/client';

const reportSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  subCity: z.string().max(100).optional(),
  format: z.enum(['json', 'csv']).optional()
});

function applyCsvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(response, headers, rows, filename) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => applyCsvEscape(row[h])).join(','));
  }
  response.setHeader('Content-Type', 'text/csv');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.send(lines.join('\n'));
}

async function authorizeReports(request, allowedRoles) {
  const roleCode = request.role?.code;
  if (!allowedRoles.includes(roleCode)) {
    throw new AppError(403, 'FORBIDDEN', `Reports are restricted to: ${allowedRoles.join(', ')}.`);
  }
}

export async function registrationsReport({ query, request, response }) {
  await authorizeReports(request, [RoleCode.LandOfficer, RoleCode.SystemAdmin]);
  const parsed = reportSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { from, to, subCity, format } = parsed.data;
  const where = {
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(subCity ? { subCity: { contains: subCity, mode: 'insensitive' } } : {})
  };
  const [items, total] = await Promise.all([
    db.landParcel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, parcelNumber: true, subCity: true, kebele: true,
        location: true, declaredSize: true, landUseType: true,
        boundaryStatus: true, createdAt: true, currentOwner: { select: { fullName: true, nationalId: true } }
      },
      take: 500
    }),
    db.landParcel.count({ where })
  ]);

  await writeAudit(request, AuditAction.ReportView, {
    entityType: 'Report',
    entityId: 'registrations',
    newSnapshot: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, subCity: subCity ?? null, count: total }
  });

  const rows = items.map((p) => ({
    parcelNumber: p.parcelNumber,
    subCity: p.subCity,
    kebele: p.kebele,
    location: p.location,
    declaredSize: p.declaredSize.toString(),
    landUseType: p.landUseType,
    boundaryStatus: p.boundaryStatus,
    createdAt: p.createdAt.toISOString(),
    ownerName: p.currentOwner?.fullName ?? '',
    ownerNationalId: p.currentOwner?.nationalId ?? ''
  }));

  if (format === 'csv') {
    const headers = ['parcelNumber', 'subCity', 'kebele', 'location', 'declaredSize', 'landUseType', 'boundaryStatus', 'createdAt', 'ownerName', 'ownerNationalId'];
    return sendCsv(response, headers, rows, `registrations-report-${Date.now()}.csv`);
  }
  return { report: 'registrations', total, items: rows };
}

export async function transfersReport({ query, request, response }) {
  await authorizeReports(request, [RoleCode.LandOfficer, RoleCode.SystemAdmin]);
  const parsed = reportSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.');
  }
  const { from, to, subCity, format } = parsed.data;
  // The transfer has parcelId FK to land_parcels; join via parcel for subCity filter.
  const parcelIds = subCity
    ? (await db.landParcel.findMany({ where: { subCity: { contains: subCity, mode: 'insensitive' } }, select: { id: true } })).map((p) => p.id)
    : null;
  const where = {
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(subCity && parcelIds ? { parcelId: { in: parcelIds } } : {})
  };
  const [items, total] = await Promise.all([
    db.transferRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, trackingId: true, status: true, salePrice: true,
        submittedAt: true, reviewedAt: true, decisionReason: true,
        createdAt: true,
        parcel: { select: { parcelNumber: true, subCity: true } },
        seller: { select: { fullName: true, nationalId: true } },
        buyer: { select: { fullName: true, nationalId: true } }
      },
      take: 500
    }),
    db.transferRequest.count({ where })
  ]);

  await writeAudit(request, AuditAction.ReportView, {
    entityType: 'Report',
    entityId: 'transfers',
    newSnapshot: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, subCity: subCity ?? null, count: total }
  });

  const rows = items.map((t) => ({
    trackingId: t.trackingId,
    status: t.status,
    salePrice: t.salePrice.toString(),
    parcelNumber: t.parcel?.parcelNumber ?? '',
    subCity: t.parcel?.subCity ?? '',
    sellerName: t.seller?.fullName ?? '',
    buyerName: t.buyer?.fullName ?? '',
    createdAt: t.createdAt.toISOString(),
    submittedAt: t.submittedAt?.toISOString() ?? '',
    reviewedAt: t.reviewedAt?.toISOString() ?? '',
    decisionReason: t.decisionReason ?? ''
  }));

  if (format === 'csv') {
    const headers = ['trackingId', 'status', 'salePrice', 'parcelNumber', 'subCity', 'sellerName', 'buyerName', 'createdAt', 'submittedAt', 'reviewedAt', 'decisionReason'];
    return sendCsv(response, headers, rows, `transfers-report-${Date.now()}.csv`);
  }
  return { report: 'transfers', total, items: rows };
}

export async function taxComplianceReport({ query, request, response }) {
  await authorizeReports(request, [RoleCode.TaxOfficial, RoleCode.SystemAdmin]);
  const parsed = reportSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.');
  }
  const { from, to, subCity, format } = parsed.data;
  const parcelIds = subCity
    ? (await db.landParcel.findMany({ where: { subCity: { contains: subCity, mode: 'insensitive' } }, select: { id: true } })).map((p) => p.id)
    : null;
  const where = {
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(subCity && parcelIds ? { parcelId: { in: parcelIds } } : {})
  };
  const records = await db.taxRecord.findMany({
    where,
    orderBy: { taxYear: 'desc' },
    select: {
      id: true, taxYear: true, calculatedAmount: true, paidAmount: true,
      creditBalance: true, status: true, holdActive: true,
      parcel: { select: { parcelNumber: true, subCity: true, declaredSize: true } }
    },
    take: 500
  });

  // Summary aggregates
  const total = records.length;
  const totalCalculated = records.reduce((s, r) => s + Number(r.calculatedAmount), 0);
  const totalPaid = records.reduce((s, r) => s + Number(r.paidAmount), 0);
  const totalOutstanding = Math.max(totalCalculated - totalPaid, 0);
  const totalHolds = records.filter((r) => r.holdActive).length;
  const byStatus = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});

  await writeAudit(request, AuditAction.ReportView, {
    entityType: 'Report',
    entityId: 'tax-compliance',
    newSnapshot: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, subCity: subCity ?? null, count: total, totalOutstanding }
  });

  const rows = records.map((r) => ({
    parcelNumber: r.parcel?.parcelNumber ?? '',
    subCity: r.parcel?.subCity ?? '',
    taxYear: r.taxYear,
    calculatedAmount: r.calculatedAmount.toString(),
    paidAmount: r.paidAmount.toString(),
    creditBalance: r.creditBalance.toString(),
    status: r.status,
    holdActive: r.holdActive ? 'true' : 'false',
    declaredSize: r.parcel?.declaredSize.toString() ?? ''
  }));

  if (format === 'csv') {
    const headers = ['parcelNumber', 'subCity', 'taxYear', 'calculatedAmount', 'paidAmount', 'creditBalance', 'status', 'holdActive', 'declaredSize'];
    return sendCsv(response, headers, rows, `tax-compliance-report-${Date.now()}.csv`);
  }
  return {
    report: 'tax-compliance',
    summary: {
      total,
      totalCalculated,
      totalPaid,
      totalOutstanding,
      totalHolds,
      byStatus
    },
    items: rows
  };
}

export async function operationsReport({ query, request, response }) {
  await authorizeReports(request, [RoleCode.SystemAdmin]);
  const parsed = reportSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.');
  }
  const { from, to, format } = parsed.data;
  const dateFilter = (from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {});

  const [
    totalParcels,
    totalTransfers,
    transfersByStatus,
    totalPayments,
    totalPaymentsCompleted,
    totalTaxCollected,
    totalAppointments,
    totalAuditLogs
  ] = await Promise.all([
    db.landParcel.count({ where: dateFilter }),
    db.transferRequest.count({ where: dateFilter }),
    db.transferRequest.groupBy({ by: ['status'], _count: { _all: true }, where: dateFilter }),
    db.paymentTransaction.count({ where: dateFilter }),
    db.paymentTransaction.count({ where: { ...dateFilter, status: 'Completed' } }),
    db.paymentTransaction.aggregate({ where: { ...dateFilter, status: 'Completed' }, _sum: { amount: true } }),
    db.appointment.count({ where: dateFilter }),
    db.auditLog.count({ where: dateFilter })
  ]);

  await writeAudit(request, AuditAction.ReportView, {
    entityType: 'Report',
    entityId: 'operations',
    newSnapshot: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null }
  });

  const summary = {
    totalParcels,
    totalTransfers,
    transfersByStatus: transfersByStatus.reduce((acc, s) => {
      acc[s.status] = s._count._all;
      return acc;
    }, {}),
    totalPayments,
    totalPaymentsCompleted,
    totalTaxCollected: Number(totalTaxCollected._sum.amount ?? 0),
    totalAppointments,
    totalAuditLogs
  };

  if (format === 'csv') {
    const headers = ['metric', 'value'];
    const rows = [
      { metric: 'totalParcels', value: summary.totalParcels },
      { metric: 'totalTransfers', value: summary.totalTransfers },
      { metric: 'totalPayments', value: summary.totalPayments },
      { metric: 'totalPaymentsCompleted', value: summary.totalPaymentsCompleted },
      { metric: 'totalTaxCollected', value: summary.totalTaxCollected },
      { metric: 'totalAppointments', value: summary.totalAppointments },
      { metric: 'totalAuditLogs', value: summary.totalAuditLogs }
    ];
    return sendCsv(response, headers, rows, `operations-report-${Date.now()}.csv`);
  }
  return { report: 'operations', summary };
}
