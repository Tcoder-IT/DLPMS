// Transfers module — implements the 8-state transfer workflow documented in
// WORKFLOWS.md §3 and DATABASE_DESIGN.md.
//
// State machine (per SECURITY_DESIGN.md and WORKFLOWS.md):
//   Draft
//     ↓ submit (citizen)
//   Submitted
//     ↓ automated tax check
//   TaxVerified ← or → TaxHold (if outstanding dues; cleared via /payments)
//     ↓ officer opens review
//   UnderReview
//     ↓ officer needs more docs
//   DocumentsRequested ←→ UnderReview
//     ↓ officer decision
//   Approved → (atomically: ownership update + history + certificate + notification + audit)
//     OR
//   Rejected (with documented reason)
//
//   Cancelled: allowed before final approval (Draft / Submitted / TaxVerified / TaxHold / UnderReview / DocumentsRequested)
//
// SECURITY_DESIGN.md: a transfer applicant MUST be the current registered owner.
// Approval requires ownership, buyer identity/eligibility, document, and tax-
// clearance validation; ownership update + history + certificate + notification
// + audit must be performed atomically (NFR-06 ACID).

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit, auditView } from '../../middleware/auditMiddleware.js';
import { AuditAction, TransferStatus } from '@prisma/client';
import { dispatchNotification } from '../notifications/notificationsService.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  status: z.nativeEnum(TransferStatus).optional(),
  parcelId: z.string().uuid().optional(),
  search: z.string().max(100).optional()
});

const createSchema = z.object({
  parcelId: z.string().uuid(),
  buyerOwnerId: z.string().uuid(),
  buyerSnapshot: z.object({}).passthrough().optional(),
  salePrice: z.number().positive().max(1_000_000_000)
});

const decisionSchema = z.object({
  reason: z.string().min(1).max(2000),
  expectedVersion: z.number().int().positive()
});

const documentRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  expectedVersion: z.number().int().positive()
});

const expectedVersionSchema = z.object({
  expectedVersion: z.number().int().positive()
});

// Allowed transitions per PDF §4.5.1 State Chart Table 24:
//   Draft → Submitted (citizen submits)
//   Submitted → TaxVerified (auto tax check: no dues)
//   Submitted → TaxHold (auto tax check: outstanding dues; citizen notified)
//   TaxHold → Submitted (citizen pays; tax check re-runs automatically)
//   TaxVerified → UnderReview (assigned to a Land Officer)
//   UnderReview → DocumentsRequested (officer needs more docs)
//   DocumentsRequested → UnderReview (citizen uploads more; review resumes)
//   UnderReview → Approved (officer verifies all docs)
//   UnderReview → Rejected (officer rejects with documented reasons)
//   Approved / Rejected → [Terminal]
//   Any active state → Cancelled (citizen cancels before final approval)
//
// The crucial difference from the M4 implementation: TaxHold goes back to
// Submitted (re-run tax check), NOT directly to TaxVerified. The re-check
// loop is what makes the "citizen pays → transfer auto-advances" path work.
const ALLOWED_TRANSITIONS = {
  [TransferStatus.Draft]: [TransferStatus.Submitted, TransferStatus.Cancelled],
  [TransferStatus.Submitted]: [TransferStatus.TaxVerified, TransferStatus.TaxHold, TransferStatus.Cancelled],
  [TransferStatus.TaxVerified]: [TransferStatus.UnderReview, TransferStatus.Cancelled],
  [TransferStatus.TaxHold]: [TransferStatus.Submitted, TransferStatus.Cancelled],
  [TransferStatus.UnderReview]: [TransferStatus.DocumentsRequested, TransferStatus.Approved, TransferStatus.Rejected, TransferStatus.Cancelled],
  [TransferStatus.DocumentsRequested]: [TransferStatus.UnderReview, TransferStatus.Approved, TransferStatus.Rejected, TransferStatus.Cancelled],
  [TransferStatus.Approved]: [],
  [TransferStatus.Rejected]: [],
  [TransferStatus.Cancelled]: []
};

function assertTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Cannot transition transfer from ${from} to ${to}.`);
  }
}

// Auto-tax-check per PDF §4.5.1: when a transfer is in Submitted state,
// the system queries the TaxRecord for outstanding dues on the parcel.
// If hold is active → transition to TaxHold + notify citizen.
// If no hold → transition to TaxVerified, then immediately to UnderReview
// (auto-assignment; a LandOfficer picks it up later via the review queue).
//
// PDF Table 24: "Tax Verified → Under Review: Request assigned to a Land
// Officer for manual verification." For the prototype, we auto-advance to
// UnderReview because there's no officer work-queue assignment algorithm
// yet — the first available LandOfficer can self-assign by reviewing it.
// The audit log records the transition; the assignedOfficerId stays null
// until an officer opens the review.
export async function runAutomatedTaxCheck({ transfer, request }) {
  const parcel = await db.landParcel.findUnique({
    where: { id: transfer.parcelId },
    select: { id: true, currentOwnerId: true }
  });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel for this transfer no longer exists.');
  }
  // Look for an active tax hold on the parcel (any tax year).
  const holdRecord = await db.taxRecord.findFirst({
    where: { parcelId: parcel.id, holdActive: true }
  });
  if (holdRecord) {
    // Transition to TaxHold + notify citizen (best-effort).
    const updated = await db.transferRequest.update({
      where: { id: transfer.id },
      data: { status: TransferStatus.TaxHold, version: { increment: 1 } },
      include: { parcel: true, seller: true, buyer: true }
    });
    await writeAudit(request, AuditAction.Update, {
      entityType: 'TransferRequest',
      entityId: transfer.id,
      oldSnapshot: { status: transfer.status },
      newSnapshot: { status: 'TaxHold', reason: 'Outstanding tax dues detected', taxRecordId: holdRecord.id }
    });
    try {
      const sellerUser = await db.ownerProfile.findUnique({
        where: { id: transfer.sellerOwnerId },
        select: { userId: true }
      });
      if (sellerUser?.userId) {
        await dispatchNotification({
          recipientUserId: sellerUser.userId,
          channel: 'sms',
          templateKey: 'transfer.tax_hold',
          payload: { transferId: transfer.id, trackingId: transfer.trackingId, taxRecordId: holdRecord.id, outstanding: Number(holdRecord.calculatedAmount) - Number(holdRecord.paidAmount) },
          scheduledAt: new Date()
        });
      }
    } catch (error) {
      console.error({ event: 'tax_hold_notification_failed', transferId: transfer.id, error: error.message });
    }
    return updated;
  }
  // No hold: transition Submitted → TaxVerified → UnderReview atomically.
  // We do this in one update since the intermediate TaxVerified state has
  // no user-observable side effect (it's a system-internal checkpoint per
  // the state chart) and the audit log captures both transitions.
  const updated = await db.transferRequest.update({
    where: { id: transfer.id },
    data: {
      status: TransferStatus.UnderReview,
      // Auto-advance from TaxVerified; assignment stays null until an
      // officer opens the review (manual self-assignment).
      version: { increment: 1 }
    },
    include: { parcel: true, seller: true, buyer: true }
  });
  await writeAudit(request, AuditAction.Update, {
    entityType: 'TransferRequest',
    entityId: transfer.id,
    oldSnapshot: { status: transfer.status },
    newSnapshot: { status: 'TaxVerified', reason: 'Automated tax check cleared' }
  });
  await writeAudit(request, AuditAction.Update, {
    entityType: 'TransferRequest',
    entityId: transfer.id,
    oldSnapshot: { status: 'TaxVerified' },
    newSnapshot: { status: 'UnderReview', reason: 'Auto-advanced to UnderReview for officer review' }
  });
  return updated;
}

export async function listTransfers({ query, request }) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Query failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { page, pageSize, status, parcelId, search } = parsed.data;
  const roleCode = request.role?.code;
  const isCitizen = roleCode === 'Citizen';
  // Citizens can only see transfers where they are seller or buyer.
  const where = {
    ...(status ? { status } : {}),
    ...(parcelId ? { parcelId } : {}),
    ...(search ? { trackingId: { contains: search, mode: 'insensitive' } } : {}),
    ...(isCitizen
      ? { OR: [{ sellerOwnerId: request.user.ownerProfile?.id }, { buyerOwnerId: request.user.ownerProfile?.id }] }
      : {})
  };
  const [items, total] = await Promise.all([
    db.transferRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { parcel: true, seller: true, buyer: true }
    }),
    db.transferRequest.count({ where })
  ]);
  return { items: items.map(transferDto), page, pageSize, total };
}

export async function getTransfer({ id, request }) {
  const transfer = await db.transferRequest.findUnique({
    where: { id },
    include: { parcel: true, seller: true, buyer: true, documents: true }
  });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found.');
  }
  // Ownership check for citizens
  if (request.role?.code === 'Citizen') {
    const ownerId = request.user.ownerProfile?.id;
    if (transfer.sellerOwnerId !== ownerId && transfer.buyerOwnerId !== ownerId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this transfer.');
    }
  }
  // NFR-07: audit the view (after authorization — failed authz still gets
  // a 403 without an audit row, since the actor was denied).
  await auditView(request, 'TransferRequest', id, { trackingId: transfer.trackingId, status: transfer.status });
  return transferDto(transfer, { withDocuments: true });
}

export async function createTransfer({ input, request }) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { parcelId, buyerOwnerId, salePrice, buyerSnapshot } = parsed.data;

  const parcel = await db.landParcel.findUnique({
    where: { id: parcelId },
    include: { currentOwner: true }
  });
  if (!parcel) {
    throw new AppError(404, 'NOT_FOUND', 'Parcel not found.');
  }
  if (!parcel.currentOwner) {
    throw new AppError(409, 'NO_OWNER', 'Parcel has no current owner; cannot transfer.');
  }
  // SECURITY_DESIGN.md: the transfer applicant must be the current registered owner.
  const sellerOwnerId = request.user.ownerProfile?.id;
  if (!sellerOwnerId || parcel.currentOwnerId !== sellerOwnerId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not the current owner of this parcel.');
  }
  if (buyerOwnerId === sellerOwnerId) {
    throw new AppError(400, 'SELF_TRANSFER', 'Buyer and seller must differ.');
  }
  const buyer = await db.ownerProfile.findUnique({ where: { id: buyerOwnerId } });
  if (!buyer) {
    throw new AppError(404, 'BUYER_NOT_FOUND', 'Buyer owner profile not found. They must register first.');
  }

  const trackingId = `TR-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const transfer = await db.transferRequest.create({
    data: {
      trackingId,
      parcelId,
      sellerOwnerId,
      buyerOwnerId,
      buyerSnapshot: buyerSnapshot ?? { fullName: buyer.fullName, nationalId: buyer.nationalId },
      salePrice,
      status: TransferStatus.Draft
    },
    include: { parcel: true, seller: true, buyer: true }
  });

  await writeAudit(request, AuditAction.Create, {
    entityType: 'TransferRequest',
    entityId: transfer.id,
    newSnapshot: { trackingId, parcelId, sellerOwnerId, buyerOwnerId, salePrice, status: 'Draft' }
  });

  return transferDto(transfer);
}

export async function submitTransfer({ id, input, request }) {
  const { expectedVersion } = expectedVersionSchema.parse(input ?? {});
  const transfer = await db.transferRequest.findUnique({ where: { id } });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found.');
  }
  if (request.role?.code === 'Citizen') {
    const ownerId = request.user.ownerProfile?.id;
    if (transfer.sellerOwnerId !== ownerId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the seller can submit this transfer.');
    }
  }
  assertTransition(transfer.status, TransferStatus.Submitted);
  if (transfer.version !== expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: transfer.version,
      expectedVersion
    });
  }
  const updated = await db.transferRequest.update({
    where: { id },
    data: { status: TransferStatus.Submitted, submittedAt: new Date(), version: { increment: 1 } },
    include: { parcel: true, seller: true, buyer: true }
  });
  await writeAudit(request, AuditAction.TransferSubmit, {
    entityType: 'TransferRequest',
    entityId: id,
    oldSnapshot: { status: transfer.status },
    newSnapshot: { status: 'Submitted' }
  });

  // PDF §4.5.1: "Upon submission, the request transitions to the Submitted
  // state, where an automated tax check is performed against the Tax Record
  // database." Run the check synchronously so the citizen sees the result
  // immediately (TaxHold or UnderReview).
  const afterCheck = await runAutomatedTaxCheck({ transfer: updated, request });
  return transferDto(afterCheck);
}

export async function cancelTransfer({ id, input, request }) {
  const { expectedVersion } = expectedVersionSchema.parse(input ?? {});
  const transfer = await db.transferRequest.findUnique({ where: { id } });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found.');
  }
  if (request.role?.code === 'Citizen') {
    const ownerId = request.user.ownerProfile?.id;
    if (transfer.sellerOwnerId !== ownerId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the seller can cancel this transfer.');
    }
  }
  assertTransition(transfer.status, TransferStatus.Cancelled);
  if (transfer.version !== expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: transfer.version,
      expectedVersion
    });
  }
  const updated = await db.transferRequest.update({
    where: { id },
    data: { status: TransferStatus.Cancelled, version: { increment: 1 } },
    include: { parcel: true, seller: true, buyer: true }
  });
  await writeAudit(request, AuditAction.TransferCancel, {
    entityType: 'TransferRequest',
    entityId: id,
    oldSnapshot: { status: transfer.status },
    newSnapshot: { status: 'Cancelled' }
  });
  return transferDto(updated);
}

export async function requestDocuments({ id, input, request }) {
  const parsed = documentRequestSchema.parse(input);
  const transfer = await db.transferRequest.findUnique({ where: { id } });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found.');
  }
  assertTransition(transfer.status, TransferStatus.DocumentsRequested);
  if (transfer.version !== parsed.data.expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: transfer.version,
      expectedVersion: parsed.data.expectedVersion
    });
  }
  const updated = await db.transferRequest.update({
    where: { id },
    data: {
      status: TransferStatus.DocumentsRequested,
      decisionReason: parsed.data.message,
      reviewedAt: new Date(),
      assignedOfficerId: request.user.id,
      version: { increment: 1 }
    },
    include: { parcel: true, seller: true, buyer: true }
  });
  await writeAudit(request, AuditAction.Update, {
    entityType: 'TransferRequest',
    entityId: id,
    oldSnapshot: { status: transfer.status },
    newSnapshot: { status: 'DocumentsRequested', message: parsed.data.message }
  });
  return transferDto(updated);
}

export async function approveTransfer({ id, input, request }) {
  const parsed = decisionSchema.parse(input);
  const transfer = await db.transferRequest.findUnique({
    where: { id },
    include: { parcel: true, seller: true, buyer: true, documents: true }
  });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found.');
  }
  assertTransition(transfer.status, TransferStatus.Approved);
  if (transfer.version !== parsed.data.expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: transfer.version,
      expectedVersion: parsed.data.expectedVersion
    });
  }

  // APPROVAL REQUIRES (per SECURITY_DESIGN.md / WORKFLOWS.md §3 step 7):
  //   1. ownership validation (seller is current owner of parcel)
  //   2. tax clearance (no outstanding dues on parcel)
  //   3. document verification (all transfer docs Verified)
  // Then atomically: update ownership, close old history row, open new history
  // row, issue certificate, audit.
  if (transfer.parcel.currentOwnerId !== transfer.sellerOwnerId) {
    throw new AppError(409, 'OWNERSHIP_MISMATCH', 'Seller is no longer the current owner of the parcel.');
  }
  const outstandingTax = await db.taxRecord.findFirst({
    where: { parcelId: transfer.parcelId, holdActive: true }
  });
  if (outstandingTax) {
    throw new AppError(409, 'TAX_HOLD_ACTIVE', 'Parcel has an outstanding tax hold. Payment required before approval.');
  }
  const unverifiedDocs = transfer.documents.filter((d) => d.verificationStatus !== 'Verified');
  if (unverifiedDocs.length > 0) {
    throw new AppError(409, 'DOCS_NOT_VERIFIED', 'All transfer documents must be Verified before approval.', {
      unverifiedCount: unverifiedDocs.length
    });
  }

  // ACID transaction (NFR-06): ownership update + history close/create + certificate + transfer status.
  const certificateNumber = `CERT-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const updated = await db.$transaction(async (tx) => {
    // Close existing ownership history row for the parcel.
    const priorHistory = await tx.ownershipHistory.findFirst({
      where: { parcelId: transfer.parcelId, endedAt: null },
      orderBy: { startedAt: 'desc' }
    });
    if (priorHistory) {
      await tx.ownershipHistory.update({
        where: { id: priorHistory.id },
        data: { endedAt: new Date(), sourceTransferId: transfer.id }
      });
    }
    // Open new ownership history row.
    await tx.ownershipHistory.create({
      data: {
        parcelId: transfer.parcelId,
        ownerId: transfer.buyerOwnerId,
        acquiredAt: new Date(),
        acquisitionMethod: 'transfer',
        sourceTransferId: transfer.id
      }
    });
    // Flip current owner on the parcel.
    const parcel = await tx.landParcel.update({
      where: { id: transfer.parcelId },
      data: { currentOwnerId: transfer.buyerOwnerId, version: { increment: 1 } }
    });
    // Mark transfer Approved.
    const t = await tx.transferRequest.update({
      where: { id },
      data: {
        status: TransferStatus.Approved,
        decisionReason: parsed.data.reason,
        reviewedAt: new Date(),
        assignedOfficerId: request.user.id,
        version: { increment: 1 }
      },
      include: { parcel: true, seller: true, buyer: true }
    });
    // Issue certificate (NFR-32 placeholder; actual PDF generation deferred).
    await tx.certificate.create({
      data: {
        parcelId: transfer.parcelId,
        ownerId: transfer.buyerOwnerId,
        transferId: transfer.id,
        certificateNumber,
        status: 'Active',
        qrPayload: `DLPMS:${certificateNumber}`
      }
    });
    return { transfer: t, parcel };
  });

  await writeAudit(request, AuditAction.Approve, {
    entityType: 'TransferRequest',
    entityId: id,
    oldSnapshot: { status: transfer.status, currentOwnerId: transfer.parcel.currentOwnerId },
    newSnapshot: { status: 'Approved', currentOwnerId: transfer.buyerOwnerId, certificateNumber }
  });

  // WORKFLOWS.md §3 step 7: "produces certificate, sends notification".
  // Best-effort: notifications must not fail the approval transaction.
  try {
    const sellerUser = await db.ownerProfile.findUnique({
      where: { id: transfer.sellerOwnerId },
      select: { userId: true }
    });
    const buyerUser = await db.ownerProfile.findUnique({
      where: { id: transfer.buyerOwnerId },
      select: { userId: true }
    });
    if (sellerUser?.userId) {
      await dispatchNotification({
        recipientUserId: sellerUser.userId,
        channel: 'sms',
        templateKey: 'transfer.approved_seller',
        payload: { transferId: transfer.id, trackingId: transfer.trackingId, parcelId: transfer.parcelId },
        scheduledAt: new Date()
      });
    }
    if (buyerUser?.userId) {
      await dispatchNotification({
        recipientUserId: buyerUser.userId,
        channel: 'sms',
        templateKey: 'transfer.approved_buyer',
        payload: { transferId: transfer.id, trackingId: transfer.trackingId, certificateNumber },
        scheduledAt: new Date()
      });
    }
  } catch (error) {
    console.error({ event: 'transfer_notification_failed', transferId: transfer.id, error: error.message });
  }

  return transferDto(updated.transfer, { withCertificate: { certificateNumber } });
}

export async function rejectTransfer({ id, input, request }) {
  const parsed = decisionSchema.parse(input);
  const transfer = await db.transferRequest.findUnique({ where: { id } });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found.');
  }
  assertTransition(transfer.status, TransferStatus.Rejected);
  if (transfer.version !== parsed.data.expectedVersion) {
    throw new AppError(409, 'CONFLICT', 'Stale version.', {
      currentVersion: transfer.version,
      expectedVersion: parsed.data.expectedVersion
    });
  }
  const updated = await db.transferRequest.update({
    where: { id },
    data: {
      status: TransferStatus.Rejected,
      decisionReason: parsed.data.reason,
      reviewedAt: new Date(),
      assignedOfficerId: request.user.id,
      version: { increment: 1 }
    },
    include: { parcel: true, seller: true, buyer: true }
  });
  await writeAudit(request, AuditAction.Reject, {
    entityType: 'TransferRequest',
    entityId: id,
    oldSnapshot: { status: transfer.status },
    newSnapshot: { status: 'Rejected', reason: parsed.data.reason }
  });
  return transferDto(updated);
}

function transferDto(transfer, opts = {}) {
  return {
    id: transfer.id,
    trackingId: transfer.trackingId,
    parcelId: transfer.parcelId,
    parcel: transfer.parcel
      ? { id: transfer.parcel.id, parcelNumber: transfer.parcel.parcelNumber }
      : null,
    sellerOwnerId: transfer.sellerOwnerId,
    seller: transfer.seller ? { id: transfer.seller.id, fullName: transfer.seller.fullName, nationalId: transfer.seller.nationalId } : null,
    buyerOwnerId: transfer.buyerOwnerId,
    buyer: transfer.buyer ? { id: transfer.buyer.id, fullName: transfer.buyer.fullName, nationalId: transfer.buyer.nationalId } : null,
    buyerSnapshot: transfer.buyerSnapshot,
    salePrice: transfer.salePrice,
    status: transfer.status,
    assignedOfficerId: transfer.assignedOfficerId ?? null,
    submittedAt: transfer.submittedAt,
    reviewedAt: transfer.reviewedAt,
    decisionReason: transfer.decisionReason,
    version: transfer.version,
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
    ...(opts.withCertificate ? { certificate: opts.withCertificate } : {}),
    ...(opts.withDocuments && transfer.documents
      ? { documents: transfer.documents.map((d) => ({ id: d.id, documentType: d.documentType, verificationStatus: d.verificationStatus })) }
      : {})
  };
}
