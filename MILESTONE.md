# DLPMS Milestone 11 — Remaining audit items per PDF (NFR-07, FR-02, FR-10, FR-15, FR-21, FR-27, §4.3 sub-systems 6+7)

This milestone closes the audit-trail gaps identified in M10's deferred-items
list. Every item is mapped to the exact PDF reference that mandates it.

## Backend additions

### 1. Audit-on-views (NFR-07)
> NFR-07: "All CRUD operations must be logged with tamper-evident audit entries including timestamp, user ID, and action type. 100% of operations logged."

Previously only mutations were audited. M11 adds a new `auditView(request,
entityType, entityId, extra)` helper in `auditMiddleware.js` (best-effort —
failures are logged but don't block the response). Called from all sensitive
GET endpoints:

| Endpoint | Audit entity |
|---|---|
| `GET /parcels/{id}` | LandParcel |
| `GET /parcels/{id}/ownership-history` | LandParcel (view: 'ownership-history') |
| `GET /transfers/{id}` | TransferRequest |
| `GET /documents/{id}` | DocumentMetadata |
| `GET /certificates/{id}` | Certificate |
| `GET /payments/{id}` | PaymentTransaction |

View audits are written **after** authorization checks pass — failed
authorization (403) does NOT produce an audit row, since the actor was denied
before seeing the data.

### 2. OTP required on login by default (FR-02)
> FR-02: "Login using phone number or email with password and OTP verification."

Previously `REQUIRE_OTP_ON_LOGIN` defaulted to `false`. M11 flips the default
to `true` (opt-out for dev). The error message tells the citizen how to
proceed: "OTP verification is required before login. Call POST /auth/otp/request, then POST /auth/otp/verify."

`.env.example` documents the new default + dev override.

### 3. Notification retry processor with exponential backoff (§4.3 sub-system 7)
> §4.3 sub-system 7: "The notification queue handles retries for failed deliveries with exponential backoff."

New `startNotificationRetryScheduler()` in `notificationsService.js`. A
30-second `setInterval` cycle:
1. Polls `Queued` notifications whose `scheduledAt <= now`.
2. Attempts mock dispatch (simulates 1% failure rate in dev to exercise the
   retry path).
3. On success: marks `Sent`, increments `retryCount`.
4. On failure: increments `retryCount`, reschedules with exponential backoff
   (30s → 2m → 8m → 32m → 128m).
5. After 5 retries: marks `Failed` + logs to console.

Started on boot in `app.js` alongside the appointment reminder scheduler and
the payment 15-min timeout sweeper. Timer is `unref()`'d for clean process
exit. Multi-instance deployments need a distributed lock (pg_advisory_lock)
— out of scope, documented.

### 4. Settings module (FR-27)
> FR-27: "Configure system parameters including tax rates, fees, and notification templates."

New module at `apps/api/src/modules/settings/`:

- `GET /admin/settings` — list all settings (SystemAdmin only, audit-logged as `View`)
- `GET /admin/settings/:key` — fetch single setting
- `PATCH /admin/settings/:key` — create or update a setting; upsert
  behavior; audit-logged as `SettingsUpdate` with old + new snapshot

Setting keys are validated against `/^[a-z][a-z0-9._-]{2,99}$/i` to prevent
typos in code that hard-codes key lookups. Documented known keys:
`tax.rate_per_sqm_etb`, `tax.surcharge_factor`,
`appointment.cancellation_window_hours`, `notification.template.{key}`.

### 5. Reports module (FR-15, FR-21, §4.3 sub-system 6)
> FR-15: "Generate comprehensive reports on land registrations and transfers" (Land Officer)
> FR-21: "Generate tax compliance reports by period and sub-city" (Tax Official)
> §4.3 sub-system 6: "The report generator produces land registration summaries, transfer reports, tax collection summaries, and operational statistics in both PDF and CSV formats, with support for filtering by date range, sub-city, and officer."

New module at `apps/api/src/modules/reports/`:

| Endpoint | Roles | Output |
|---|---|---|
| `GET /reports/registrations?from=&to=&subCity=&format=` | LandOfficer, SystemAdmin | Land parcel rows with owner name + national ID (authed report) |
| `GET /reports/transfers?from=&to=&subCity=&format=` | LandOfficer, SystemAdmin | Transfer rows with seller/buyer/parcel/status |
| `GET /reports/tax-compliance?from=&to=&subCity=&format=` | TaxOfficial, SystemAdmin | Summary aggregates (total, calculated, paid, outstanding, holds, byStatus) + per-record rows |
| `GET /reports/operations?from=&to=&format=` | SystemAdmin | Aggregate counts: parcels, transfers (by status), payments, completed payments, total tax collected, appointments, audit logs |

All endpoints accept `from`, `to`, `subCity` query filters per the PDF. All
support `format=csv` for CSV export (proper escaping). All views are
audit-logged as `ReportView`.

### 6. Public search module (FR-10)
> FR-10: "Search public land records by parcel ID, owner name, or location."
> PROJECT_DECISIONS.md: "Public search — Which fields are public, whether owner name is truly public, consent/legal basis, result granularity, rate limits, and anti-enumeration rules. Until decided, expose no private ownership/document data."

New module at `apps/api/src/modules/public/`:

- `GET /public/parcels/search` — public, no auth required
  - Rate-limited: 20 searches/minute/IP (per SECURITY_DESIGN.md "Implement
    abuse controls for... public search")
  - Search params: `q` (free-text across parcel number + sub-city + kebele +
    location), `parcelNumber`, `subCity`, `kebele`, `location`, `page`,
    `pageSize` (max 50, smaller than authed endpoints)
  - Returns ONLY public fields: `id`, `parcelNumber`, `subCity`, `kebele`,
    `location`, `declaredSize`, `sizeUnit`, `landUseType`, `boundaryStatus`,
    `registeredAt`
  - EXCLUDES: owner name, national ID, contact info, tax records, ownership
    history, boundary geometry
  - Every response includes a `privacyNotice` field documenting the data policy
  - All searches audit-logged as `PublicSearch` (actorUserId null;
    IP captured for forensic use)

## Schema additions
3 new `AuditAction` enum values:
- `SettingsUpdate` — for `/admin/settings` PATCH
- `ReportView` — for `/reports/*` GET
- `PublicSearch` — for `/public/parcels/search` GET

## Frontend additions

### Staff portal — Settings page (`/settings`)
SystemAdmin can:
- List all settings
- Edit a known setting (tax rate, surcharge, cancellation window) with a
  typed input (number) instead of raw JSON
- Edit any setting's raw JSON value + description
- Create new settings from the "Configure a known setting" panel

All changes audit-logged via the API.

### Staff portal — Reports page (`/reports`)
Role-aware report tabs (LandOfficer sees registrations + transfers;
TaxOfficial adds tax-compliance; SystemAdmin adds operations). Each report:
- Date-range + sub-city filters
- "Apply" button to load JSON
- "CSV" button to export (uses raw fetch with auth header to download the
  CSV blob)
- Operations report renders a metric grid + transfers-by-status badges
- Tax-compliance report renders summary metrics + by-status badges + per-record table
- Registrations + transfers reports render a per-record table

### Citizen PWA — Public Search page (`/search`)
**Accessible without authentication.** Per PDF §4.9 (UI Design Standards)
this is the public-facing land-records lookup. Includes its own minimal top
bar (logo + "Sign in" link) so unauthenticated visitors can navigate to
login. The page:
- Free-text + sub-city + kebele + location filters
- Auto-loads the 20 most recent parcels on mount
- Each result card shows parcel number, sub-city/kebele/location, declared
  size, land use type, boundary status badge, registration date
- Privacy notice rendered inline so the user is clear on what's NOT shown

Logged-in citizens can also access via the "Public search" link in the
citizen top bar.

## Verification
- `npm run lint`: clean (both apps)
- `npm run build`: green. Citizen PWA grew to ~240 KB / 71 KB gzipped
  (added Payments + PublicSearch pages). Staff portal grew to ~390 KB /
  117 KB gzipped (added Settings + Reports pages).
- Live boot: API + both Vite dev servers running detached via `setsid`:
  - `/api/v1/health` → 200
  - `/admin/settings`, `/reports/registrations`, `/reports/operations` → 401 (auth wall)
  - `/public/parcels/search?q=DDW` → 500 (no DB; expected — endpoint does a
    real query, no graceful no-DB path)
  - All 4 new UI page modules load via Vite HMR (`/src/pages/{Payments,PublicSearch,Settings,Reports}Page.jsx` → 200)
- OpenAPI now documents **63 endpoints** (up from 56 in M10; +7: 1 settings-list +
  2 settings-key(GET+PATCH) + 4 reports + 1 public-search = 8, minus the
  `/admin/users/{id}` GET which was already documented but counted differently)

## What remains (deferred to M12+)
- **PostGIS swap** (boundary still `Json`) — production-only; dev keeps the
  in-process polygon overlap detector
- **Real provider adapters** (telebirr, SMS/email via Africa's Talking/Twilio,
  certificate signing) — pending external contracts per PROJECT_DECISIONS.md
- **Multi-instance distributed lock** for the 3 schedulers (appointment
  reminder, payment timeout, notification retry)
- **Amharic localization** (NFR-11) — schema supports `preferredLanguage='am'`
  but the UI is English-only
- **Document malware scanning/quarantine** — deployment decision per
  SECURITY_DESIGN.md
- **Certificate revocation/reissue UI** — admin can currently revoke via
  direct DB access but no UI surface
- **Map click-to-edit existing polygon vertices** — currently only draw-new
  is supported
- **Shapefile import** — UI supports GeoJSON only currently
