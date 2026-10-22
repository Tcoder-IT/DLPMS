// Payments module — initiates a mock telebirr payment, returns its state,
// and processes refunds (admin-only per SECURITY_DESIGN.md). The actual
// provider callback is received at /webhooks/payments/telebirr (see
// webhooksService.js), which validates the signature, idempotently marks
// the payment Completed, updates the linked TaxRecord (paidAmount,
// creditBalance, holdActive), and writes audit entries.
//
// WORKFLOWS.md §4 step 4: validate amount against outstanding due.
// Step 5: full payment removes a tax hold; partial payment keeps it;
// overpayment becomes documented credit balance.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  getProviderName,
  issueTransactionReference,
  buildWebhookPayload,
  signWebhook
} from './telebirrProvider.js';

const initiateSchema = z.object({
  taxRecordId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000)
});

const refundSchema = z.object({
  reason: z.string().min(1).max(2000)
});

export async function initiatePayment({ input, request }) {
  const parsed = initiateSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const { taxRecordId, amount } = parsed.data;
  const taxRecord = await db.taxRecord.findUnique({
    where: { id: taxRecordId },
    include: { parcel: true }
  });
  if (!taxRecord) {
    throw new AppError(404, 'NOT_FOUND', 'Tax record not found.');
  }
  // SECURITY_DESIGN.md: citizens can only pay their own tax records.
  if (request.role?.code === 'Citizen') {
    const ownerId = request.user.ownerProfile?.id;
    if (taxRecord.parcel?.currentOwnerId !== ownerId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not own this parcel.');
    }
  }
  // WORKFLOWS.md §4 step 4: validate amount vs outstanding due.
  const outstanding = Number(taxRecord.calculatedAmount) - Number(taxRecord.paidAmount) - Number(taxRecord.creditBalance);
  if (amount > outstanding + 0.01) {
    // Overpayment allowed; the surplus is recorded as credit per WORKFLOWS.md §4.
    // No hard rejection — but flag it for the client.
  }

  const transactionRef = issueTransactionReference();
  const payment = await db.paymentTransaction.create({
    data: {
      taxRecordId: taxRecord.id,
      payerOwnerId: taxRecord.parcel.currentOwnerId,
      transactionRef,
      amount,
      method: PaymentMethod.OnlineTelebirr,
      status: PaymentStatus.Initiated,
      providerRef: `${getProviderName()}-${transactionRef}`
    }
  });

  await writeAudit(request, AuditAction.PaymentInitiate, {
    entityType: 'PaymentTransaction',
    entityId: payment.id,
    newSnapshot: { transactionRef, amount, taxRecordId, method: 'OnlineTelebirr' }
  });

  // Mock provider: return a webhook payload + signature so the client can
  // immediately replay the callback to /webhooks/payments/telebirr. In
  // production, telebirr would call our webhook out-of-band.
  const webhookPayload = buildWebhookPayload({
    transactionRef,
    taxRecordId: taxRecord.id,
    amount,
    status: 'Completed'
  });
  const webhookSignature = signWebhook(webhookPayload, process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret');

  return {
    payment: paymentDto(payment),
    provider: {
      name: getProviderName(),
      // Mock: in production this would be a telebirr-hosted URL.
      // For the prototype, the test client POSTs webhookPayload to
      // /webhooks/payments/telebirr with x-telebirr-signature: webhookSignature.
      callbackUrl: `/api/v1/webhooks/payments/${getProviderName()}`,
      webhookPayload,
      webhookSignature
    }
  };
}

export async function getPayment({ id, request }) {
  const payment = await db.paymentTransaction.findUnique({
    where: { id },
    include: { taxRecord: { include: { parcel: true } } }
  });
  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', 'Payment not found.');
  }
  if (request.role?.code === 'Citizen') {
    const ownerId = request.user.ownerProfile?.id;
    if (payment.payerOwnerId !== ownerId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this payment.');
    }
  }
  return paymentDto(payment, { withTaxRecord: true });
}

export async function refundPayment({ id, input, request }) {
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const payment = await db.paymentTransaction.findUnique({
    where: { id },
    include: { taxRecord: true }
  });
  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', 'Payment not found.');
  }
  if (payment.status !== PaymentStatus.Completed) {
    throw new AppError(409, 'NOT_REFUNDABLE', `Only Completed payments may be refunded. Current status: ${payment.status}`);
  }
  // SECURITY_DESIGN.md: refund is an administrator action only.
  if (request.role?.code !== 'SystemAdmin') {
    throw new AppError(403, 'FORBIDDEN', 'Refund is restricted to System Administrators.');
  }
  const updated = await db.$transaction(async (tx) => {
    // Reverse the tax-record effect of the original payment.
    const reversedPaid = Math.max(Number(payment.taxRecord.paidAmount) - Number(payment.amount), 0);
    const reversedCredit = Math.max(Number(payment.taxRecord.creditBalance) - Math.max(Number(payment.amount) - (Number(payment.taxRecord.calculatedAmount) - (Number(payment.taxRecord.paidAmount) - Number(payment.amount))), 0), 0);
    const stillOwed = Number(payment.taxRecord.calculatedAmount) - reversedPaid > 0;
    await tx.taxRecord.update({
      where: { id: payment.taxRecord.id },
      data: {
        paidAmount: reversedPaid,
        creditBalance: reversedCredit,
        holdActive: stillOwed,
        status: stillOwed ? 'PartiallyPaid' : 'Calculated',
        version: { increment: 1 }
      }
    });
    return tx.paymentTransaction.update({
      where: { id },
      data: { status: PaymentStatus.Refunded, version: { increment: 1 } }
    });
  });
  await writeAudit(request, AuditAction.Refund, {
    entityType: 'PaymentTransaction',
    entityId: id,
    oldSnapshot: { status: payment.status },
    newSnapshot: { status: 'Refunded', reason: parsed.data.reason }
  });
  return paymentDto(updated);
}

export async function applyCompletedPayment({ payment, taxRecordId, providerRef, providerPayload, requestId }) {
  // Called from webhooksService after signature validation. Idempotent.
  if (payment.status === PaymentStatus.Completed) {
    return { payment: paymentDto(payment), alreadyApplied: true };
  }
  const updated = await db.$transaction(async (tx) => {
    const tax = await tx.taxRecord.findUnique({ where: { id: taxRecordId } });
    if (!tax) throw new AppError(404, 'NOT_FOUND', 'Tax record not found.');
    const newPaid = Number(tax.paidAmount) + Number(payment.amount);
    const newCredit = Math.max(newPaid - Number(tax.calculatedAmount), 0);
    const effectivePaid = Math.min(newPaid, Number(tax.calculatedAmount));
    const fullyPaid = effectivePaid >= Number(tax.calculatedAmount) - 0.01;
    const partial = !fullyPaid && effectivePaid > 0;
    await tx.taxRecord.update({
      where: { id: tax.id },
      data: {
        paidAmount: effectivePaid,
        creditBalance: newCredit,
        holdActive: !fullyPaid,
        status: fullyPaid ? 'Paid' : partial ? 'PartiallyPaid' : tax.status,
        version: { increment: 1 }
      }
    });
    return tx.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.Completed,
        providerRef: providerRef ?? payment.providerRef,
        providerPayload: providerPayload ?? payment.providerPayload,
        completedAt: new Date(),
        version: { increment: 1 }
      }
    });
  });
  // The webhook path is unauthenticated; build a synthetic request shape for audit.
  await writeAudit(
    { id: requestId ?? null, user: { id: null }, get: () => null, socket: { remoteAddress: null } },
    AuditAction.PaymentComplete,
    {
      entityType: 'PaymentTransaction',
      entityId: updated.id,
      newSnapshot: { status: 'Completed', taxRecordId }
    }
  );
  return { payment: paymentDto(updated), alreadyApplied: false };
}

function paymentDto(payment, opts = {}) {
  return {
    id: payment.id,
    taxRecordId: payment.taxRecordId,
    payerOwnerId: payment.payerOwnerId,
    transactionRef: payment.transactionRef,
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    providerRef: payment.providerRef ?? null,
    initiatedAt: payment.initiatedAt,
    completedAt: payment.completedAt ?? null,
    version: payment.version,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    ...(opts.withTaxRecord && payment.taxRecord
      ? { taxRecord: { id: payment.taxRecord.id, taxYear: payment.taxRecord.taxYear, calculatedAmount: payment.taxRecord.calculatedAmount } }
      : {})
  };
}
