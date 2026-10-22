// Mock telebirr payment provider adapter. Per SECURITY_DESIGN.md, the
// payment processing uses a provider-neutral adapter; the prototype uses
// mock/sandbox services only and never initiates real financial transactions.
// The mock provider:
//   - issues a deterministic transaction reference (so tests are reproducible)
//   - "completes" payments synchronously via a webhook simulator (below)
//   - signs webhook payloads with an HMAC-SHA256 of the canonical body so
//     the webhook signature validation path is exercised end-to-end
//
// Real telebirr credentials/contract are out of scope (PROJECT_DECISIONS.md).

import { createHmac, randomUUID } from 'node:crypto';

const PROVIDER = 'telebirr';

export function getProviderName() {
  return PROVIDER;
}

export function issueTransactionReference(prefix = 'TBR') {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().slice(0, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// Build the payload the provider would send back to our webhook.
// In production this is delivered out-of-band by telebirr's servers; here we
// return it so the caller (the test client or /payments/initiate response)
// can replay it against /webhooks/payments/telebirr.
export function buildWebhookPayload({ transactionRef, taxRecordId, amount, status = 'Completed' }) {
  return {
    provider: PROVIDER,
    transactionRef,
    taxRecordId,
    amount,
    status,
    currency: 'ETB',
    timestamp: new Date().toISOString()
  };
}

// Canonical encoding for signature (must match the verifier).
export function canonicalBody(body) {
  return JSON.stringify(body, Object.keys(body).sort());
}

export function signWebhook(body, secret) {
  return createHmac('sha256', secret).update(canonicalBody(body)).digest('hex');
}

// Verify an incoming webhook signature. The signature is expected in the
// `x-telebirr-signature` header, lowercase hex.
export function verifyWebhookSignature(body, signature, secret) {
  if (!signature) return false;
  const expected = signWebhook(body, secret);
  if (signature.length !== expected.length) return false;
  // Constant-time compare to avoid timing side channels.
  let acc = 0;
  for (let i = 0; i < expected.length; i++) {
    acc |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return acc === 0;
}
