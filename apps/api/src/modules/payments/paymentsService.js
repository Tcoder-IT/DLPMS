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
import { writeAudit, auditView } from '../../middleware/auditMiddleware.js';
import { AuditAction, PaymentMethod, PaymentStatus } from '@prisma/client';
import { withAdvisoryLock, ADVISORY_KEYS } from '../../lib/advisoryLock.js';
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
  // PDF §4.5.2: "When a citizen initiates a tax payment, the transaction
  // enters the Initiated state and a payment request is sent to the
  // telebirr Payment Gateway. The transaction then transitions to
  // Pending, where the system waits for the citizen to complete the
  // payment on their mobile device."
  //
  // For the mock provider, both transitions happen at once because the
  // "request" to telebirr is synchronous (we just record the signed
  // webhook payload for the client to replay). We record both states in
  // the audit log; the visible DB status is Pending.
  const payment = await db.paymentTransaction.create({
    data: {
      taxRecordId: taxRecord.id,
      payerOwnerId: taxRecord.parcel.currentOwnerId,
      transactionRef,
      amount,
      method: PaymentMethod.OnlineTelebirr,
      status: PaymentStatus.Pending,
      providerRef: `${getProviderName()}-${transactionRef}`
    }
  });
  await writeAudit(request, AuditAction.PaymentInitiate, {
    entityType: 'PaymentTransaction',
    entityId: payment.id,
    newSnapshot: { transactionRef, amount, taxRecordId, method: 'OnlineTelebirr', status: 'Initiated → Pending' }
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
  // NFR-07: audit the view.
  await auditView(request, 'PaymentTransaction', id, { transactionRef: payment.transactionRef, status: payment.status });
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
  const syntheticRequest = { id: requestId ?? null, user: { id: null }, get: () => null, socket: { remoteAddress: null } };
  await writeAudit(
    syntheticRequest,
    AuditAction.PaymentComplete,
    {
      entityType: 'PaymentTransaction',
      entityId: updated.id,
      newSnapshot: { status: 'Completed', taxRecordId }
    }
  );

  // PDF §4.5.1 Table 24: "Tax Hold → Submitted: Citizen pays outstanding
  // tax; tax check re-run automatically." The payment just cleared the tax
  // hold (if fully paid); find any TaxHold transfers on this parcel and
  // re-run the tax check on them so they auto-advance.
  try {
    const { runAutomatedTaxCheck } = await import('../transfers/transfersService.js');
    const taxRecord = await db.taxRecord.findUnique({
      where: { id: taxRecordId },
      select: { parcelId: true, holdActive: true }
    });
    if (taxRecord && !taxRecord.holdActive) {
      const heldTransfers = await db.transferRequest.findMany({
        where: { parcelId: taxRecord.parcelId, status: 'TaxHold' }
      });
      for (const t of heldTransfers) {
        // Transition TaxHold → Submitted (re-run tax check) per the state chart.
        await db.transferRequest.update({
          where: { id: t.id },
          data: { status: 'Submitted', version: { increment: 1 } }
        });
        await writeAudit(syntheticRequest, AuditAction.Update, {
          entityType: 'TransferRequest',
          entityId: t.id,
          oldSnapshot: { status: 'TaxHold' },
          newSnapshot: { status: 'Submitted', reason: 'Tax hold cleared by payment; re-running tax check' }
        });
        // Run the tax check (will now transition to TaxVerified → UnderReview).
        await runAutomatedTaxCheck({
          transfer: { ...t, status: 'Submitted', parcelId: taxRecord.parcelId },
          request: syntheticRequest
        });
      }
    }
  } catch (error) {
    // Best-effort: payment success must not fail because of a transfer
    // auto-advance error. The hold is cleared; the citizen/officer can
    // manually re-trigger the tax check by re-submitting the transfer.
    console.error({ event: 'transfer_auto_advance_failed', taxRecordId, paymentId: payment.id, error: error.message });
  }

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

// ---------------------------------------------------------------------------
// Payment 15-min timeout sweeper — PDF §4.5.2: "If no webhook callback is
// received within 15 minutes, the transaction times out and is also marked
// as Failed." Runs on the same setInterval pattern as the appointment
// reminder scheduler. Multi-instance deployments need a distributed lock.
// ---------------------------------------------------------------------------

const PAYMENT_TIMEOUT_INTERVAL_MS = 5 * 60 * 1000; // run every 5 min
const PAYMENT_TIMEOUT_WINDOW_MS = 15 * 60 * 1000;   // 15-min PDF rule

let paymentTimer = null;

export function startPaymentTimeoutScheduler() {
  if (paymentTimer) return paymentTimer;
  paymentTimer = setInterval(runPaymentTimeoutCycle, PAYMENT_TIMEOUT_INTERVAL_MS);
  paymentTimer.unref?.();
  return paymentTimer;
}

export function stopPaymentTimeoutScheduler() {
  if (paymentTimer) {
    clearInterval(paymentTimer);
    paymentTimer = null;
  }
}

async function runPaymentTimeoutCycle() {
  await withAdvisoryLock(ADVISORY_KEYS.PAYMENT_TIMEOUT, async () => {
    const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_WINDOW_MS);
    // Any Pending or Processing payment older than 15 min from now is timed out.
    const stale = await db.paymentTransaction.findMany({
      where: {
        status: { in: [PaymentStatus.Pending, PaymentStatus.Processing, PaymentStatus.Initiated] },
        initiatedAt: { lt: cutoff }
      }
    });
    for (const p of stale) {
      await db.paymentTransaction.update({
        where: { id: p.id },
        data: { status: PaymentStatus.Failed, version: { increment: 1 } }
      });
      const syntheticRequest = { id: null, user: { id: null }, get: () => null, socket: { remoteAddress: null } };
      await writeAudit(syntheticRequest, AuditAction.PaymentFail, {
        entityType: 'PaymentTransaction',
        entityId: p.id,
        oldSnapshot: { status: p.status },
        newSnapshot: { status: 'Failed', reason: 'Webhook timeout (15 min)' }
      });
      // PDF §4.5.2: "the system administrator is notified for manual
      // investigation." Dispatch a notification to the admin via the
      // notification queue (best-effort).
      try {
        const { dispatchNotification } = await import('../notifications/notificationsService.js');
        // Look up a SystemAdmin to notify.
        const admin = await db.user.findFirst({
          where: { role: { code: 'SystemAdmin' }, active: true },
          select: { id: true }
        });
        if (admin) {
          await dispatchNotification({
            recipientUserId: admin.id,
            channel: 'email',
            templateKey: 'payment.timeout_investigation',
            payload: { paymentId: p.id, transactionRef: p.transactionRef, initiatedAt: p.initiatedAt.toISOString() },
            scheduledAt: new Date()
          });
        }
      } catch (error) {
        console.error({ event: 'payment_timeout_notification_failed', paymentId: p.id, error: error.message });
      }
    }
  });
}
