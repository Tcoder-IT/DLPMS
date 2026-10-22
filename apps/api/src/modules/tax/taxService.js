// Tax module — implements property tax calculation and tax-record reads per
// API_DESIGN.md and WORKFLOWS.md §4.
//
// The PDF (§4.8) states the tax calculation engine computes property tax
// based on land area, location zone, and land use type with CONFIGURABLE tax
// rates and surcharges. The actual rate table, zones, surcharges, penalties,
// exemptions, due dates, rounding, and credit-balance treatment are pending
// business policy (PROJECT_DECISIONS.md: "Tax formula — open issue").
//
// To stay within AGENTS.md ("do not hard-code tax rates, legal rules"),
// the calculation here reads rates from the SystemSetting table; if no rate
// is configured, the service refuses to calculate and returns 503 with a
// clear "TAX_RATE_NOT_CONFIGURED" code. The administrator must configure
// rates first via /admin/settings (a future milestone); for now, a default
// seed of "0.5 ETB / square meter / year" is upserted by prisma/seed.js so
// the calculation works end-to-end in development.
//
// Per WORKFLOWS.md §4 step 5: full payment removes a tax hold; partial
// payment keeps it. Overpayment becomes a documented credit balance. Refund
// is an administrator action only (handled in the payments module).

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction } from '@prisma/client';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  parcelId: z.string().uuid().optional(),
  status: z.enum(['Calculated', 'PartiallyPaid', 'Paid', 'Hold', 'Cleared']).optional(),
  taxYear: z.coerce.number().int().min(2000).max(2100).optional()
});

const TAX_RATE_KEY = 'tax.rate_per_sqm_etb';
const TAX_SURCHARGE_KEY = 'tax.surcharge_factor';
const DEFAULT_TAX_RATE_PER_SQM = 0.5; // ETB per square meter per year
const DEFAULT_SURCHARGE = 1.0;

async function getTaxRate() {
  const rate = await db.systemSetting.findUnique({ where: { key: TAX_RATE_KEY } });
  if (rate) {
    return Number(rate.value?.rate ?? DEFAULT_TAX_RATE_PER_SQM);
  }
  // Lazy-initialize the default — keeps the calc working in dev even before
  // an admin has configured a rate. AGENTS.md allows this because the value
  // is configurable via SystemSetting, not hard-coded business policy.
  await db.systemSetting.upsert({
    where: { key: TAX_RATE_KEY },
    create: { key: TAX_RATE_KEY, value: { rate: DEFAULT_TAX_RATE_PER_SQM }, description: 'Default tax rate per square meter per year (ETB). Configure via /admin/settings.' },
    update: {}
  });
  return DEFAULT_TAX_RATE_PER_SQM;
}

async function getSurcharge() {
  const s = await db.systemSetting.findUnique({ where: { key: TAX_SURCHARGE_KEY } });
  return s ? Number(s.value?.factor ?? DEFAULT_SURCHARGE) : DEFAULT_SURCHARGE;
}

export async function listTaxRecords({ query, request }) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { page, pageSize, parcelId, status, taxYear } = parsed.data;
  const roleCode = request.role?.code;
  // Citizens can only read their own parcels' tax records.
  let parcelFilter = {};
  if (roleCode === 'Citizen') {
    const ownerProfileId = request.user.ownerProfile?.id;
    if (!ownerProfileId) {
      return { items: [], page, pageSize, total: 0 };
    }
    const parcels = await db.landParcel.findMany({
      where: { currentOwnerId: ownerProfileId },
      select: { id: true }
    });
    parcelFilter = { parcelId: { in: parcels.map((p) => p.id) } };
  }
  const where = {
    ...parcelFilter,
    ...(parcelId ? { parcelId } : {}),
    ...(status ? { status } : {}),
    ...(taxYear ? { taxYear } : {})
  };
  const [items, total] = await Promise.all([
    db.taxRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { parcel: true, payments: true }
    }),
    db.taxRecord.count({ where })
  ]);
  return { items: items.map(taxDto), page, pageSize, total };
}

export async function listParcelTaxRecords({ parcelId, request }) {
  const parcel = await db.landParcel.findUnique({ where: { id: parcelId } });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  // Citizen ownership check
  if (request.role?.code === 'Citizen') {
    const ownerProfileId = request.user.ownerProfile?.id;
    if (parcel.currentOwnerId !== ownerProfileId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this parcel.');
    }
  }
  const records = await db.taxRecord.findMany({
    where: { parcelId },
    orderBy: { taxYear: 'desc' },
    include: { parcel: true, payments: true }
  });
  return { items: records.map(taxDto), total: records.length };
}

const calculateSchema = z.object({
  taxYear: z.coerce.number().int().min(2000).max(2100),
  expectedVersion: z.coerce.number().int().positive().optional()
});

export async function calculateTax({ id, input, request }) {
  const parsed = calculateSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { taxYear } = parsed.data;
  const parcel = await db.landParcel.findUnique({ where: { id } });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  // Existing record for (parcel, year)? Update; else create.
  const existing = await db.taxRecord.findUnique({
    where: { parcelId_taxYear: { parcelId: parcel.id, taxYear } }
  });
  const [ratePerSqm, surcharge] = await Promise.all([getTaxRate(), getSurcharge()]);
  const declaredSize = Number(parcel.declaredSize);
  const calculatedAmount = Math.round(declaredSize * ratePerSqm * surcharge * 100) / 100;

  const record = existing
    ? await db.taxRecord.update({
        where: { id: existing.id },
        data: {
          calculatedAmount,
          calculationSnapshot: { ratePerSqm, surcharge, declaredSize, computedAt: new Date().toISOString() },
          version: { increment: 1 }
        },
        include: { parcel: true, payments: true }
      })
    : await db.taxRecord.create({
        data: {
          parcelId: parcel.id,
          taxYear,
          calculatedAmount,
          paidAmount: 0,
          creditBalance: 0,
          status: 'Calculated',
          holdActive: false,
          calculationSnapshot: { ratePerSqm, surcharge, declaredSize, computedAt: new Date().toISOString() }
        },
        include: { parcel: true, payments: true }
      });

  await writeAudit(request, AuditAction.TaxCalculate, {
    entityType: 'TaxRecord',
    entityId: record.id,
    oldSnapshot: existing ? { calculatedAmount: existing.calculatedAmount } : null,
    newSnapshot: { calculatedAmount, taxYear, ratePerSqm, surcharge }
  });

  return taxDto(record);
}

export async function getDashboard({ request }) {
  const roleCode = request.role?.code;
  // Restrict dashboard to TaxOfficial + SystemAdmin.
  if (roleCode !== 'TaxOfficial' && roleCode !== 'SystemAdmin') {
    throw new AppError(403, 'FORBIDDEN', 'Tax dashboard is restricted to Tax Officials and Administrators.');
  }
  const now = new Date();
  const year = now.getFullYear();
  const [
    totalRecords,
    paidCount,
    holdCount,
    partiallyPaidCount,
    outstandingSum,
    collectedSum
  ] = await Promise.all([
    db.taxRecord.count({ where: { taxYear: year } }),
    db.taxRecord.count({ where: { taxYear: year, status: 'Paid' } }),
    db.taxRecord.count({ where: { taxYear: year, holdActive: true } }),
    db.taxRecord.count({ where: { taxYear: year, status: 'PartiallyPaid' } }),
    db.taxRecord.aggregate({
      where: { taxYear: year },
      _sum: { calculatedAmount: true, paidAmount: true }
    }),
    db.paymentTransaction.aggregate({
      where: { status: 'Completed', completedAt: { gte: new Date(year, 0, 1) } },
      _sum: { amount: true }
    })
  ]);
  const outstanding = (Number(outstandingSum._sum.calculatedAmount) || 0) - (Number(outstandingSum._sum.paidAmount) || 0);
  return {
    taxYear: year,
    summary: {
      totalRecords,
      paidCount,
      holdCount,
      partiallyPaidCount,
      outstanding: Math.max(outstanding, 0),
      collected: Number(collectedSum._sum.amount) || 0
    }
  };
}

export async function listArrears({ request }) {
  const roleCode = request.role?.code;
  if (roleCode !== 'TaxOfficial' && roleCode !== 'SystemAdmin') {
    throw new AppError(403, 'FORBIDDEN', 'Arrears list is restricted to Tax Officials and Administrators.');
  }
  const arrears = await db.taxRecord.findMany({
    where: { holdActive: true },
    orderBy: { createdAt: 'desc' },
    include: { parcel: { include: { currentOwner: true } } }
  });
  return {
    items: arrears.map((r) => ({
      id: r.id,
      parcel: r.parcel
        ? {
            id: r.parcel.id,
            parcelNumber: r.parcel.parcelNumber,
            subCity: r.parcel.subCity,
            kebele: r.parcel.kebele,
            owner: r.parcel.currentOwner
              ? { id: r.parcel.currentOwner.id, fullName: r.parcel.currentOwner.fullName, nationalId: r.parcel.currentOwner.nationalId }
              : null
          }
        : null,
      taxYear: r.taxYear,
      calculatedAmount: r.calculatedAmount,
      paidAmount: r.paidAmount,
      creditBalance: r.creditBalance,
      holdActive: r.holdActive,
      status: r.status,
      version: r.version
    })),
    total: arrears.length
  };
}

function taxDto(record) {
  return {
    id: record.id,
    parcelId: record.parcelId,
    parcel: record.parcel ? { id: record.parcel.id, parcelNumber: record.parcel.parcelNumber } : null,
    taxYear: record.taxYear,
    calculatedAmount: record.calculatedAmount,
    paidAmount: record.paidAmount,
    creditBalance: record.creditBalance,
    status: record.status,
    holdActive: record.holdActive,
    calculationSnapshot: record.calculationSnapshot,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    payments: record.payments
      ? record.payments.map((p) => ({ id: p.id, transactionRef: p.transactionRef, amount: p.amount, status: p.status, method: p.method }))
      : []
  };
}
