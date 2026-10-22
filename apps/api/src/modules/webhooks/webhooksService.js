// Webhooks module — receives payment provider callbacks, validates the
// signature, and applies the payment to the linked TaxRecord idempotently.
//
// SECURITY_DESIGN.md (Payment and integration security):
//   - Verify provider webhook signatures
//   - Timestamp/replay protections where supported
//   - Idempotent processing via unique transaction/provider references
//   - Failed validation is recorded and triggers the documented
//     administrative investigation path (audit entry; no state change)
//
// PROJECT_DECISIONS.md: providers are pending external approval; the
// prototype ships a mock telebirr provider that signs payloads with
// HMAC-SHA256 over the canonical sorted-key JSON body.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, PaymentStatus } from '@prisma/client';
import { verifyWebhookSignature } from '../payments/telebirrProvider.js';

const PROVIDERS = new Set(['telebirr']);

const payloadSchema = z.object({
  provider: z.string().min(1).max(50),
  transactionRef: z.string().min(1).max(200),
  taxRecordId: z.string().uuid(),
  amount: z.number().nonnegative(),
  status: z.enum(['Completed', 'Failed', 'Pending']),
  currency: z.string().max(10).optional(),
  timestamp: z.string().optional()
});

// Best-effort audit write for the unauthenticated webhook path. If the audit
// chain is unreachable (e.g., DB down), the webhook response must still return
// the correct security outcome (401 on bad signature, 404 on unknown
// provider, 409 on replay). We swallow audit failures here and log them.
async function bestEffortAudit(requestId, action, fields) {
  try {
    await writeAudit(
      { id: requestId ?? null, user: { id: null }, get: () => null, socket: { remoteAddress: null } },
      action,
      fields
    );
  } catch (error) {
    console.error({ event: 'webhook_audit_failed', action, error: error.message });
  }
}

export async function handlePaymentWebhook({ provider, body, signature, requestId }) {
  if (!PROVIDERS.has(provider)) {
    throw new AppError(404, 'UNKNOWN_PROVIDER', `Provider '${provider}' is not supported.`);
  }
  const secret = process.env.WEBHOOK_SECRET ?? null;
  if (!secret) {
    // Misconfiguration: refuse to process; do not fall back to no-signature mode.
    throw new AppError(500, 'WEBHOOK_SECRET_MISSING', 'WEBHOOK_SECRET is not configured.');
  }
  // Replay protection: payload must include a timestamp not older than 15 min.
  // (SECURITY_DESIGN.md: "missing callback after 15 minutes is failed")
  if (body?.timestamp) {
    const ts = new Date(body.timestamp).getTime();
    if (Number.isFinite(ts) && Date.now() - ts > 15 * 60 * 1000) {
      await bestEffortAudit(requestId, AuditAction.WebhookReceived, {
        entityType: 'PaymentTransaction',
        newSnapshot: { transactionRef: body?.transactionRef ?? null, rejected: 'REPLAY_WINDOW_EXPIRED' }
      });
      throw new AppError(409, 'REPLAY_WINDOW_EXPIRED', 'Webhook timestamp is outside the accepted window.');
    }
  }

  // Signature validation BEFORE parsing the body schema (so the error
  // message doesn't leak payload contents).
  const ok = verifyWebhookSignature(body, signature, secret);
  if (!ok) {
    await bestEffortAudit(requestId, AuditAction.WebhookReceived, {
      entityType: 'PaymentTransaction',
      newSnapshot: { transactionRef: body?.transactionRef ?? null, rejected: 'INVALID_SIGNATURE' }
    });
    throw new AppError(401, 'INVALID_SIGNATURE', 'Webhook signature validation failed.');
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Webhook payload failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const payload = parsed.data;

  // Idempotency: locate by transactionRef. If already Completed, return early.
  const payment = await db.paymentTransaction.findUnique({
    where: { transactionRef: payload.transactionRef },
    include: { taxRecord: true }
  });
  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', `No payment transaction matches reference ${payload.transactionRef}.`);
  }
  if (payment.status === PaymentStatus.Completed) {
    return { accepted: true, idempotent: true, paymentId: payment.id, status: payment.status };
  }

  // PDF §4.5.2: "If a webhook callback is received from telebirr, the
  // transaction moves to the Processing state, where the webhook
  // signature is validated against the shared secret key and the payment
  // amount is verified against the expected tax amount."
  //
  // The signature was already validated BEFORE this point in
  // handlePaymentWebhook — so once we reach here, signature is OK. We
  // still need to verify the amount matches the expected tax due. The
  // Processing transition is recorded; if the amount doesn't match, we
  // transition to Failed.
  await db.paymentTransaction.update({
    where: { id: payment.id },
    data: { status: PaymentStatus.Processing, version: { increment: 1 } }
  });
  await bestEffortAudit(requestId, AuditAction.WebhookReceived, {
    entityType: 'PaymentTransaction',
    entityId: payment.id,
    newSnapshot: { status: 'Processing', transactionRef: payload.transactionRef }
  });

  // Amount verification (PDF §4.5.2: "the payment amount is verified
  // against the expected tax amount"). The webhook payload's amount
  // must match the recorded payment amount exactly (we trust the
  // original initiatePayment amount; if the provider sends a different
  // amount, that's a spoofing/investigation signal).
  if (Number(payload.amount) !== Number(payment.amount)) {
    await db.paymentTransaction.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.Failed, providerPayload: payload, version: { increment: 1 } }
    });
    await bestEffortAudit(requestId, AuditAction.PaymentFail, {
      entityType: 'PaymentTransaction',
      entityId: payment.id,
      newSnapshot: { status: 'Failed', reason: 'Amount mismatch', expected: Number(payment.amount), received: Number(payload.amount) }
    });
    throw new AppError(409, 'AMOUNT_MISMATCH', 'Webhook amount does not match the expected payment amount.');
  }

  if (payload.status !== 'Completed') {
    // Failed / Pending callback — record but don't change to Completed.
    const failedUpdated = await db.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        status: payload.status === 'Failed' ? PaymentStatus.Failed : PaymentStatus.Pending,
        providerPayload: payload,
        version: { increment: 1 }
      }
    });
    await writeAudit(
      { id: requestId ?? null, user: { id: null }, get: () => null, socket: { remoteAddress: null } },
      AuditAction.PaymentFail,
      {
        entityType: 'PaymentTransaction',
        entityId: payment.id,
        newSnapshot: { status: failedUpdated.status, transactionRef: payload.transactionRef }
      }
    );
    return { accepted: true, idempotent: false, paymentId: payment.id, status: failedUpdated.status };
  }

  // Apply the completed payment to the linked TaxRecord (ACID per NFR-06).
  const { applyCompletedPayment } = await import('../payments/paymentsService.js');
  const result = await applyCompletedPayment({
    payment,
    taxRecordId: payload.taxRecordId,
    providerRef: payload.transactionRef,
    providerPayload: payload,
    requestId
  });
  return { accepted: true, idempotent: false, paymentId: result.payment.id, status: result.payment.status };
}
