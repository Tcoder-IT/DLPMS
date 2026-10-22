# DLPMS Milestone 4 — Transfers, Tax, GIS, Payments, Webhooks

Builds on M3 (identity + RBAC + audit + parcels + admin + audit-read) by adding
the four sub-systems the PDF Chapter 4 designates as core domain modules:
Transfers, Tax & Payment, GIS boundary management, and the payment webhook
ingestion path. Per `AGENTS.md`, all mock/sandbox integrations are behind
provider-neutral adapters — no live telebirr credentials are required.

## What was added

### Transfers module (`/transfers`)
Implements the 8-state machine documented in `WORKFLOWS.md §3` and
`DATABASE_DESIGN.md`:

```
Draft ─► Submitted ─► TaxVerified ─► UnderReview ─► Approved (or Rejected)
                       ▲
                       └─► TaxHold (if outstanding dues; cleared via /payments)
                       ▲
                       └─► DocumentsRequested ◄─► UnderReview
Cancelled: allowed before final approval
```

- `GET /transfers` — paginated list (Citizens see only their own)
- `POST /transfers` — create Draft (seller must be current owner)
- `GET /transfers/{id}`
- `POST /transfers/{id}/submit` (Draft → Submitted; needs `expectedVersion`)
- `POST /transfers/{id}/cancel` (any non-final state → Cancelled)
- `POST /transfers/{id}/request-documents` (UnderReview → DocumentsRequested; LandOfficer)
- `POST /transfers/{id}/approve` (LandOfficer; **ACID transaction**:
  close prior ownership history row → create new ownership history row →
  flip `parcels.currentOwnerId` → issue `Certificate` → mark transfer Approved)
- `POST /transfers/{id}/reject` (LandOfficer; documented reason required)

Approval is gated on: ownership validation, tax clearance (no active `TaxHold`),
and all transfer documents Verified.

### Tax module (`/tax`, plus `/parcels/{id}/tax-records`)
Implements `WORKFLOWS.md §4` (tax calculation + payment effects + arrears).

- `GET /tax` — list tax records (Citizens limited to own parcels)
- `GET /parcels/{id}/tax-records` — parcel-scoped read (ownership-checked)
- `POST /tax/records/{id}/calculate` — calculate or recalculate a tax record
  for a given year using configurable rates from `SystemSetting` (default
  `0.5 ETB / square meter / year` is lazy-initialized so dev works end-to-end;
  administrator can override via /admin/settings in a later milestone).
  AGENTS.md compliance: rates are **not hard-coded business policy**.
- `GET /tax/dashboard` — summary for the current tax year (TaxOfficial/SystemAdmin)
- `GET /tax/arrears` — parcels with active tax holds

### GIS module (`/gis`)
Implements `WORKFLOWS.md §5` (boundary upload, overlap detection, verification).
Per `PROJECT_DECISIONS.md`, production uses PostGIS `geometry(Polygon, 4326)`
with `ST_Intersects`. This milestone stores boundaries as GeoJSON Polygon in
`LandParcel.boundaryJson` (Json) and runs an in-process overlap detector
(segment-intersection + point-in-polygon) — sufficient for the prototype; the
swap to ST_Intersects is a localized change inside `gisService.js`.

- `GET /gis/parcels` — list parcels with GIS metadata (GISOfficer/SystemAdmin)
- `GET /gis/parcels/{id}/boundary` — fetch boundary GeoJSON
- `PUT /gis/parcels/{id}/boundary` — upload/replace boundary (resets status to Pending)
- `POST /gis/parcels/{id}/verify` — pairwise overlap check vs all other
  parcels with boundaries; sets `Verified` or `OverlapConflict` and returns the
  conflicting parcels
- `POST /gis/boundaries/import` — bulk import from a feature collection
- `GET /gis/overlaps` — scan all parcel boundaries and report pairwise overlaps

### Payments module (`/payments`)
Implements `WORKFLOWS.md §4` (initiate, callback, refund).

- `POST /payments/initiate` — creates a `PaymentTransaction` in `Initiated`
  state, returns the mock telebirr callback URL + signed webhook payload +
  signature so the client can immediately replay the callback. (Citizens can
  only pay for their own parcels.)
- `GET /payments/{id}` — fetch a payment (Citizens limited to their own)
- `POST /payments/{id}/refund` — **SystemAdmin only**. Reverses the linked
  `TaxRecord` effects (paidAmount, creditBalance, holdActive, status) inside
  an ACID transaction.

### Webhooks module (`/webhooks`)
Implements `FR-33` (webhook signature validation) and the
`SECURITY_DESIGN.md` Payment and integration security rules:
signature-validated, idempotent (by `transactionRef`), replay-protected
(15-minute window), provider-allowlisted.

- `POST /webhooks/payments/{provider}` — accepts a signed callback. On valid
  signature and a `Completed` payload, applies the payment to the linked
  `TaxRecord` (paidAmount, creditBalance, holdActive, status) inside an ACID
  transaction and writes a `PaymentComplete` audit entry. On `Failed`/`Pending`
  status, updates the transaction without changing the TaxRecord to Paid. On
  invalid signature, writes a `WebhookReceived` audit entry with
  `rejected: INVALID_SIGNATURE` and returns 401. All audit writes on the
  invalid-signature path are best-effort (do not block the security response
  if the audit chain is unavailable).

### Mock telebirr adapter
`apps/api/src/modules/payments/telebirrProvider.js` — provider-neutral adapter.
Signs webhook payloads with HMAC-SHA256 over the canonical sorted-key JSON
body. Constant-time signature compare. The mock returns the signed payload to
the test client so it can replay the callback against
`/webhooks/payments/telebirr` with header `x-telebirr-signature`.

### Schema additions
- `AuditAction` enum extended with: `TransferSubmit`, `TransferCancel`,
  `TaxCalculate`, `PaymentInitiate`, `PaymentComplete`, `PaymentFail`,
  `WebhookReceived`.

### Env / config
- `WEBHOOK_SECRET` added to `.env.example` and `env.js`. Must be set to a
  long random value in any non-dev deployment.
- `apps/api/src/app.js` mounts 5 new routers under `/api/v1`: `/transfers`,
  `/tax`, `/gis`, `/payments`, `/webhooks`. Body size limit raised to 256kb
  to accommodate GeoJSON boundary payloads.

### OpenAPI
Spec at `/api-docs` now documents **40 endpoints** (up from 19 in M3).

## Security controls reaffirmed

| SECURITY_DESIGN.md rule | Where |
|---|---|
| Webhook signature validation (FR-33) | `webhooksService.js` + `telebirrProvider.js` |
| Replay protection (15-minute window) | `webhooksService.js` |
| Idempotent callback processing | `webhooksService.js` (looks up by `transactionRef`) |
| Refund is admin-only | `paymentsService.refundPayment` (RBAC: SystemAdmin) |
| ACID transactions for multi-step writes | `transfersService.approveTransfer`, `paymentsService.refundPayment`, `paymentsService.applyCompletedPayment` all use `db.$transaction` |
| Optimistic concurrency (409 Conflict) | all PATCH/POST mutating endpoints take `expectedVersion` |
| Tax hold cleared by full payment | `paymentsService.applyCompletedPayment` flips `holdActive` to false when `paidAmount >= calculatedAmount` |
| Partial payment keeps hold active | same code path — `holdActive` stays true until full |
| Overpayment becomes credit balance | same code path — surplus recorded in `creditBalance` |
| Boundary conflict requires officer resolution | `gisService.verifyBoundary` sets `OverlapConflict` and lists conflicts |

## What is still intentionally NOT in this milestone

- Real telebirr credentials/contract (still mock adapter)
- Real SMS/email dispatch (`/notifications` endpoints)
- Appointments (`/appointments`, `/appointment-slots`)
- Certificates download (`/certificates/{id}/download`)
- Document uploads (`/documents`)
- CIS adapter (production contract pending)
- Frontend integration (citizen PWA + staff portal remain M2 placeholders)
- PostGIS spatial indexes (boundary stored as Json; swap is localized)

These remain governed by the blueprint documents and will be addressed in
subsequent milestones.
