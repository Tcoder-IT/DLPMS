# DLPMS Milestone 5 — Appointments, Certificates, Notifications

Builds on M4 (transfers/tax/GIS/payments/webhooks) by adding the three
remaining sub-systems designated as core domain modules in PDF Chapter 4
§4.3: the Appointment Scheduler, the Certificate Generator, and the
Notification Sub-System. Per `AGENTS.md`, all outbound integrations remain
adapter-based; mock/sandbox providers ship first, with no live credentials.

## What was added

### Appointments module (`/appointments` + `/appointment-slots`)
Implements `WORKFLOWS.md §6` (appointment workflow) and `FR-36` (24-hour
reminders — handled in the notifications module's scheduler).

- `GET /appointments` — paginated list (Citizens see only their own;
  LandOfficers see only those assigned to them; SystemAdmin sees all)
- `POST /appointments` — book an appointment (Citizen/SystemAdmin).
  Real-time double-book recheck using a ±30-minute slot window around
  the requested time. The citizen must have an `OwnerProfile`. The
  selected officer must be an active `LandOfficer`. Booking triggers
  two notifications: an immediate SMS confirmation and a queued 24-hour
  reminder.
- `GET /appointments/{id}` — ownership-checked read
- `PATCH /appointments/{id}` — reschedule (rechecks slot availability;
  version-protected via `expectedVersion`)
- `POST /appointments/{id}/cancel` — within a **configurable**
  cancellation window (default 2 hours, controllable via
  `SystemSetting` per AGENTS.md "make it configurable; do not assume a
  duration")
- `GET /appointment-slots` — list slots (LandOfficer sees own;
  SystemAdmin sees all)
- `POST /appointment-slots` — create slots (LandOfficer/SystemAdmin);
  5–240 minute duration range; unique constraint on
  `(officerId, startsAt, endsAt)` rejects duplicates

### Certificates module (`/certificates`)
Implements `FR-32` (PDF certificate with digital signature + watermark
+ QR code) and `WORKFLOWS.md §8`.

- `GET /certificates/{id}` — fetch metadata (Citizens limited to own)
- `POST /certificates/{id}/download` — streams a real PDF generated
  with `pdfkit` + `qrcode`:
  - Header: "DIRE DAWA LAND ADMINISTRATION — Land Ownership Certificate"
  - Certificate number, status, issue date
  - Parcel information block (parcel number, location, declared size, land use)
  - Registered owner block (full name, national ID, address)
  - QR code linking to `/api/v1/certificates/{id}` (the verification endpoint)
  - Diagonal watermark: "PROTOTYPE — NOT LEGALLY BINDING"
  - Footer disclaimer about pending signing authority per PROJECT_DECISIONS.md
  - Download is audit-logged before PDF generation so a PDF-generation
    failure does not skip the audit row.

Per `PROJECT_DECISIONS.md`, the legal signing authority, key management,
and QR payload format are unspecified — the prototype is explicit about
this in the watermark and footer.

### Notifications module (`/notifications` + admin templates)
Implements `FR-30` (SMS), `FR-31` (email), and `FR-36` (24-hour reminders).
Per `SECURITY_DESIGN.md` "CIS, SMS, email, and storage adapters have
least-privilege credentials" — the prototype ships a mock provider that
records the `Notification` row and immediately marks it `Sent` (dev) or
leaves it `Queued` (production simulation).

- `GET /notifications` — paginated list scoped to `request.user.id`
- `GET /notifications/unread` — count of `Queued` notifications for the user
- `PATCH /notifications/{id}/read` — mark as read (recipient-scoped)
- `GET /admin/notification-templates` — list templates (SystemAdmin).
  Templates are stored as `SystemSetting` rows keyed
  `notification.template.{key}` so administrators can edit them
  without code changes.

### In-process 24-hour reminder scheduler (FR-36)
`notificationsService.startReminderScheduler()` runs a 5-minute interval
that:
1. Finds `Scheduled` appointments whose `scheduledAt` is 24h ± 5min from now
2. Looks up the citizen user from the linked `OwnerProfile`
3. Dispatches a `Queued` `appointment.reminder_24h` notification (idempotent
   by checking existing notifications for the same `appointmentId`)

The timer is `unref()`'d so the process can still exit cleanly. Multi-
instance deployments need a distributed lock (e.g., `pg_advisory_lock`)
to avoid duplicate reminders — out of scope for M5.

### Cross-module wiring (best-effort notification dispatch)
- `transfersService.approveTransfer` — after the ACID ownership transfer,
  dispatches an SMS to the seller and a separate SMS to the buyer
  (per `WORKFLOWS.md §3 step 7` "produces certificate, sends
  notification"). Failures are logged but do not fail the transfer.
- `appointmentsService.bookAppointment` — dispatches the immediate
  confirmation SMS and queues the 24-hour reminder.

### Schema additions
- `AuditAction` enum extended with: `AppointmentBook`,
  `AppointmentCancel`, `AppointmentReschedule`, `CertificateIssue`,
  `CertificateDownload`, `NotificationDispatch`.

### Env / config
- `PUBLIC_BASE_URL` added to `.env.example` and `env.js` — used to build
  the QR-code verification URL embedded in certificate PDFs.
- `apps/api/src/app.js` mounts 3 new routers under `/api/v1`:
  `/appointments`, `/appointment-slots`, `/certificates`,
  `/notifications`, and `/admin/notification-templates`.
- The reminder scheduler is started on boot unless `NODE_ENV=production`
  and `ENABLE_SCHEDULER != 'true'`.

### OpenAPI
Spec at `/api-docs` now documents **50 endpoints** (up from 40 in M4,
19 in M3, 1 in M2).

## Security controls reaffirmed

| SECURITY_DESIGN.md rule | Where |
|---|---|
| Server-side ownership for citizen resources | appointments, certificates, notifications all check `request.user.ownerProfile.id` or `request.user.id` |
| Configurable, not hard-coded business policy | `appointment.cancellation_window_hours` is a `SystemSetting`; AGENTS.md compliance |
| Real-time slot availability recheck | `bookAppointment` and `rescheduleAppointment` both query for conflicting slots at the moment of mutation |
| Optimistic concurrency (409 Conflict) | all PATCH endpoints take `expectedVersion` |
| Audit logging of privileged actions | certificate download is audit-logged before PDF generation |
| Notifications behind an adapter | mock provider in `notificationsService.dispatchNotification` — swappable for real Africa's Talking/Twilio/email |
| Background scheduling remains inside the monolith | `setInterval`-based in-process scheduler (PDF §4.8) |
| Idempotent notification dispatch | reminder scheduler checks for existing notifications before dispatching |

## What is still intentionally NOT in this milestone

- Real SMS/email provider credentials (still mock)
- Real certificate signing authority (watermark is explicit about this)
- Document uploads (`/documents`) — still deferred
- CIS adapter (production contract pending)
- Frontend integration (citizen PWA + staff portal remain M2 placeholders)
- PostGIS spatial indexes (still `Json` for boundaries)
- Multi-instance distributed lock for the reminder scheduler

These remain governed by the blueprint documents and will be addressed in
subsequent milestones.
