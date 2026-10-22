# DLPMS Milestone 10 — Workflow correctness audit + completion

This milestone fixes logical flaws in the M3–M9 implementation that violated
the PDF's state charts and use case workflows. The audit was triggered by
re-reading PDF §4.5.1 (Land Transfer Request state chart) and §4.5.2 (Payment
Transaction state chart) carefully against the M4 implementation.

## Critical flaws fixed

### 1. `submitTransfer` skipped the auto-tax-check
**PDF §4.5.1**: "Upon submission, the request transitions to the Submitted
state, where an **automated tax check is performed** against the Tax Record
database. If the parcel has outstanding tax dues, the request transitions to
the Tax Hold state... Once tax clearance is confirmed, the request moves to
the Under Review state."

**M4 bug**: `submitTransfer` only transitioned Draft → Submitted and stayed
there. The auto-tax-check was missing.

**Fix**: Added `runAutomatedTaxCheck({ transfer, request })` in
`transfersService.js` that:
- Queries for an active tax hold on the parcel
- If hold exists → transitions to `TaxHold`, writes an `Update` audit entry,
  dispatches a `transfer.tax_hold` notification to the seller (best-effort)
- If no hold → transitions to `TaxVerified` → `UnderReview` (both audit
  entries written; the intermediate `TaxVerified` state is a system-internal
  checkpoint per the state chart with no user-observable side effect)

`submitTransfer` now calls `runAutomatedTaxCheck` synchronously after the
Draft → Submitted transition, so the citizen sees the final state
(`TaxHold` or `UnderReview`) immediately.

### 2. `TaxHold → Submitted` (re-run tax check), not `TaxHold → TaxVerified`
**PDF Table 24**: "Tax Hold → Submitted: Citizen pays outstanding tax; tax
check re-run automatically."

**M4 bug**: My `ALLOWED_TRANSITIONS` had `TaxHold → TaxVerified`, skipping
the re-check loop entirely.

**Fix**: Updated the state machine to `TaxHold → Submitted`. The recovery
path is now: citizen pays → `applyCompletedPayment` (see #3) → finds
TaxHold transfers on the parcel → transitions them back to Submitted →
re-runs `runAutomatedTaxCheck` → auto-advances to UnderReview.

### 3. `applyCompletedPayment` didn't re-trigger the tax check
**PDF Table 24**: the recovery path requires the tax check to re-run after
the citizen pays.

**M4 bug**: `applyCompletedPayment` updated the TaxRecord (clearing the
hold) but did NOT touch any TaxHold transfers on the parcel. They sat
stuck in TaxHold forever.

**Fix**: After a successful payment, `applyCompletedPayment` now:
- Re-fetches the TaxRecord to confirm the hold is cleared
- Finds all `TaxHold` transfers on the same parcel
- For each: transitions `TaxHold → Submitted` (audit-logged), then calls
  `runAutomatedTaxCheck` which auto-advances to `UnderReview`
- All best-effort: payment success must not fail because of a transfer
  auto-advance error

### 4. `createParcel` didn't issue the initial Certificate
**PDF UC-02 step 9**: "System generates a unique Parcel ID and a **digital
certificate (PDF)**."

**M4 bug**: `createParcel` created the parcel + initial ownership history
row inside a transaction, but did NOT create a `Certificate` row. The
citizen had no certificate until a transfer happened.

**Fix**: The `$transaction` block now also creates a `Certificate` row
with a generated `certificateNumber` (`CERT-YYYY-XXXXXXXX`), status
`Active`, and `qrPayload` linking back to the API verification endpoint.
Two audit entries are written: `Create` (parcel) and `CertificateIssue`
(initial registration). A `parcel.registered` SMS notification is
dispatched to the new owner (best-effort).

### 5. Payment webhook skipped the `Processing` state
**PDF §4.5.2**: "If a webhook callback is received from telebirr, the
transaction moves to the **Processing** state, where the webhook signature
is validated against the shared secret key and the payment amount is
verified against the expected tax amount. Upon successful validation, the
transaction transitions to the **Completed** state... If the signature
validation fails or the amount does not match, the transaction is marked
as **Failed**."

**M4 bug**: `handlePaymentWebhook` validated the signature (good) but
then transitioned directly to `Completed`, skipping `Processing` and
the amount-verification step.

**Fix**: The webhook handler now:
1. Transitions `Pending → Processing` (audit-logged)
2. Verifies the payload amount matches the recorded payment amount
   exactly (mismatch → `Failed` + admin notification + 409 AMOUNT_MISMATCH)
3. Only then proceeds to `applyCompletedPayment` which transitions
   `Processing → Completed`

### 6. Payment 15-min timeout sweeper missing
**PDF §4.5.2**: "If no webhook callback is received within 15 minutes, the
transaction times out and is also marked as Failed."

**M4 bug**: No timeout. Pending payments stayed Pending forever.

**Fix**: Added `startPaymentTimeoutScheduler()` in
`paymentsService.js`. A 5-minute `setInterval` cycle finds all
payments in `Initiated`/`Pending`/`Processing` whose `initiatedAt` is
older than 15 minutes, marks them `Failed`, writes a `PaymentFail`
audit entry with reason "Webhook timeout (15 min)", and dispatches an
`email` notification to a SystemAdmin ("payment.timeout_investigation")
per §4.5.2 "the system administrator is notified for manual
investigation." Started on boot in `app.js` alongside the appointment
reminder scheduler. Timer is `unref()`'d for clean process exit.

### 7. Receipt PDF generator missing
**PDF UC-03 step 9**: "System generates a tax receipt (PDF)."

**M4 bug**: Only certificates had a PDF generator (M5). Receipts didn't.

**Fix**: Added `apps/api/src/modules/payments/receiptsService.js` with
`downloadReceiptPdf({ id, request })` that:
- Loads the payment + linked TaxRecord + parcel + payer
- Verifies status is `Completed` (409 if not)
- Ownership-checks (payer OR SystemAdmin/TaxOfficial)
- Audit-logs the download BEFORE PDF generation
- Generates a real A5 PDF via `pdfkit` + `qrcode`:
  - "DIRE DAWA LAND ADMINISTRATION — Property Tax Payment Receipt" header
  - Transaction reference, receipt date, status
  - Payment details (amount, method, tax year, calculated/paid/parcel)
  - Payer block (name, national ID)
  - QR code linking to `/api/v1/payments/{id}` (verification)
  - Diagonal "PROTOTYPE — NOT LEGALLY BINDING" watermark
  - Footer disclaimer about pending signing authority

New endpoint: `GET /payments/{id}/receipt.pdf` (streams PDF, audit-logged).

## Backend correctness — `initiatePayment` state fix
**PDF §4.5.2**: "the transaction enters the Initiated state and a payment
request is sent to the telebirr Payment Gateway. The transaction then
transitions to Pending, where the system waits for the citizen to complete
the payment on their mobile device."

**M4 bug**: `initiatePayment` created the row in `Initiated` state and
left it there.

**Fix**: Now creates the row in `Pending` state directly (since the mock
provider's "request to telebirr" is synchronous). The audit entry
captures the `Initiated → Pending` transition for traceability.

## New UI — closes end-to-end workflow gaps

### Citizen PWA — Payments page (`/payments`)
Per PDF Figure 30 wireframe ("Property Tax Payment - Mobile"). Lets the
citizen:
1. Select a parcel → see outstanding tax records
2. Initiate a mock telebirr payment for a tax record (auto-fills the
   outstanding amount)
3. **Replay the signed webhook callback** — the mock provider returns a
   signed payload + signature in the `initiate` response; the citizen
   clicks "Replay webhook callback" to POST it to
   `/webhooks/payments/telebirr`. This simulates the citizen completing
   the payment on their phone.
4. View payment history (walks all their parcels' tax records' embedded
   payments, most recent first)
5. Download the receipt PDF for Completed payments

A contextual banner reminds the citizen: "When a tax hold is cleared, any
transfers on this parcel that were in TaxHold state automatically
re-submit and re-run the tax check (PDF §4.5.1 Table 24)."

### Staff portal — Parcel detail page (`/parcels/:id`)
Officers can now click a parcel from the list page and see:
- Full parcel metadata + boundary status badge
- "Open in GIS" button linking to the map page
- Current owner block (name + national ID)
- Ownership history chain (Past vs Current badges)
- Tax records list with hold status

Replaces the previous behavior where `/parcels/:id` just rendered the
list page (an M8 placeholder).

### Staff portal — Appointments management page (`/appointments`)
LandOfficers can now see their schedule:
- Today / This week / All filter buttons
- Each appointment card shows service type, scheduled time, purpose,
  citizen name + national ID, status badge, cancellation reason (if any)

Replaces the previous placeholder that redirected to the dashboard.

## Verification
- `npm run lint`: clean (both apps).
- `npm run build`: green. Citizen PWA 231 KB / 69 KB gzipped (was 222 /
  67 in M9 — added Payments page). Staff portal 376 KB / 113 KB gzipped
  (was 370 / 112 — added parcel detail + appointments pages).
- Smoke test (4 endpoints): all return expected codes:
  - `/health` → 200
  - `/transfers/{id}/submit` (no auth) → 401 (auth wall)
  - `/payments/{id}/receipt.pdf` (no auth) → 401 (new endpoint reachable)
  - `/webhooks/payments/telebirr` (no auth, no signature) → 401 (signature
    validation returns cleanly even with DB unreachable — best-effort audit
    swallow logs the Prisma error without breaking the response)
- OpenAPI at `/api-docs` now documents **56 endpoints** (added
  `/payments/{id}/receipt.pdf`).

## What remains (logical audit, not yet fixed)
- **Notification queue with retry + exponential backoff** (PDF §4.3
  sub-system 7) — currently the mock provider marks `Sent` immediately
- **Audit on view operations** (NFR-07: "All CRUD operations must be
  logged including views") — currently only mutations are audited
- **`/admin/settings` endpoints** (FR-27: configure tax rates, fees,
  notification templates, appointment cancellation window)
- **`/reports/*` endpoints** (FR-15, FR-21, FR-26)
- **`/public/parcels/search`** (FR-10) — fields pending business/privacy
  policy per `PROJECT_DECISIONS.md`
- **OTP required on login by default** (FR-02 says "password and OTP
  verification"; currently optional via `REQUIRE_OTP_ON_LOGIN` env)
- **Real provider adapters** (telebirr, SMS, email, certificate signing)
- **PostGIS swap** (boundary still stored as `Json`)
- **Multi-instance distributed lock** for the schedulers
- **Amharic localization** (NFR-11)
