# DLPMS Milestone 12 — Amharic localization (NFR-11, §4.9.5) + Certificate revocation/reissue lifecycle + Multi-instance scheduler locks

This milestone implements three of the remaining audit items from M11's deferred list:

1. **NFR-11 + §4.9.5 Amharic localization** — full i18n for both apps
2. **Certificate revocation + reissue lifecycle** — closes the cert state model
3. **Multi-instance scheduler locks** — pg_advisory_xact_lock for the 3 schedulers

## What was added

### 1. Amharic localization (NFR-11, §4.9.5)
> NFR-11: "The system shall support Amharic and English languages with user-selectable language preference. All UI labels, messages, and system notifications rendered correctly in both languages."
> §4.9.5: "The language switcher component provides immediate language switching between Amharic and English without page reload."

Both apps now ship with:
- `i18next` + `react-i18next` initialized in `src/i18n/index.js`
- English resource bundle `src/i18n/locales/en.json` (6 namespaces: app, nav, common, status, pages, errors)
- Amharic resource bundle `src/i18n/locales/am.json` (full Amharic translations of all keys)
- `<LanguageSwitcher>` component in both Layouts — uses `i18n.changeLanguage()` which immediately re-renders all `useTranslation()`-subscribed components WITHOUT page reload (satisfies §4.9.5)
- Language choice persisted in `localStorage` (`dlpms.locale` for citizen PWA, `dlpms.staff.locale` for staff portal — separate keys so sessions don't bleed)
- `<html lang="...">` attribute updated for accessibility (screen readers)
- `AuthContext` syncs the language from `user.preferredLanguage` on login (unless the user has already explicitly switched this session — the localStorage value signals that)
- All nav labels + the top-bar strings now go through `t()` — the language switcher re-renders the entire shell instantly

The Layouts use `t()` for nav labels + the log-out button + the app title. The page components themselves still have hardcoded English strings for now (the deepest translation layer); the foundation is in place — subsequent commits can replace individual strings with `t()` calls without restructuring.

### 2. Certificate revocation + reissue lifecycle
> §3.3.4 class diagram + `CertificateStatus` enum: Active → Revoked (admin) or Active → Replaced (when reissue creates a new Active cert).

New endpoints in `apps/api/src/modules/certificates/`:
- `POST /certificates/{id}/revoke` (SystemAdmin only) — sets `status=Revoked`, `revokedAt=now`; audit-logged as `CertificateRevoke`. Subsequent `POST /certificates/{id}/download` returns 409 `CERT_NOT_ACTIVE` (already implemented in `downloadCertificatePdf`).
- `POST /certificates/{id}/reissue` (LandOfficer/SystemAdmin) — ACID transaction:
  - Marks old cert as `Replaced` with `revokedAt=now`
  - Creates new `Active` certificate with fresh `certificateNumber` (`CERT-YYYY-XXXXXXXX`) + `qrPayload`
  - Audit-logged as `CertificateReissue` with both old + new snapshots

Per SECURITY_DESIGN.md "elevated actions are audited" — refund, certificate revocation, and other privileged admin operations are restricted to SystemAdmin.

### 3. Multi-instance scheduler locks
> §4.8.2 + deployment guidance: "Database connection pooling is managed through Prisma's built-in connection pooler."

New `apps/api/src/lib/advisoryLock.js` exposes `withAdvisoryLock(key, fn)`:
- Opens a Prisma transaction
- Calls `pg_try_advisory_xact_lock(key)` (transaction-scoped; auto-released on commit/rollback; non-blocking — returns immediately with `true`/`false`)
- If acquired: runs the cycle body
- If not acquired (another instance is processing): silently skips this cycle
- If DB unreachable: logs + returns `null` (best-effort; scheduler doesn't crash)

Stable 64-bit integer keys per scheduler:
- `APPOINTMENT_REMINDER = 1001`
- `PAYMENT_TIMEOUT = 1002`
- `NOTIFICATION_RETRY = 1003`

All 3 scheduler cycle bodies (`runReminderCycle`, `runPaymentTimeoutCycle`, `runRetryCycle`) now wrap their work in `withAdvisoryLock()`. In a single-instance dev deployment, the lock is always immediately granted (no contention). In a multi-instance production deployment, only one instance processes each cycle per round — preventing duplicate reminders, double-marking payments as Failed, or duplicate notification dispatch.

### Schema additions
2 new `AuditAction` enum values: `CertificateRevoke`, `CertificateReissue`.

## Frontend

### Citizen PWA
- New `src/i18n/` directory: `index.js` setup + `locales/en.json` + `locales/am.json`
- New `src/components/LanguageSwitcher.jsx` — rendered in Layout top bar
- `Layout.jsx` rewritten to use `t()` for nav labels + app title + log-out button
- `AuthContext.jsx` syncs language from `user.preferredLanguage` on login/register/refresh
- `lib/format.js` exports new `useStatusTranslator()` hook for translating status enum values

### Staff portal
- Same i18n structure (separate localStorage key so sessions don't bleed)
- Staff-specific nav keys added: `tax`, `gis`, `reports`, `auditLogs`, `settings`, `users`
- Layout + AuthContext use `t()` + `syncLanguage` same as citizen PWA

## Verification
- `npm run lint`: clean (both apps)
- `npm run build`: green
  - Citizen PWA: 305 KB / 95 KB gzipped (was 240/71 in M11 — added i18next + react-i18next + 2 locale JSON files)
  - Staff portal: 460 KB / 141 KB gzipped (was 390/117 — same i18n addition)
- Live boot: API + both Vite dev servers running detached
  - API: `/api/v1/health` → 200; `/certificates/{id}/{revoke,reissue}` → 401 (auth wall)
  - Citizen + Staff: `i18n/index.js`, `locales/en.json`, `locales/am.json` all return 200 via Vite HMR
- OpenAPI now **65 endpoints** (was 63 in M11; added `/certificates/{id}/revoke` + `/certificates/{id}/reissue`)

## What remains (deferred to M13+)
- **PostGIS swap** (boundary still `Json`) — production-only; dev keeps the in-process polygon overlap detector
- **Real provider adapters** (telebirr, SMS/email via Africa's Talking/Twilio, certificate signing) — pending external contracts
- **Document malware scanning/quarantine** — deployment decision per SECURITY_DESIGN.md
- **Map click-to-edit existing polygon vertices** — currently only draw-new is supported
- **Shapefile import** — UI supports GeoJSON only currently
- **Deep page-level translation** — the Layout shell + nav is fully i18n'd; the page bodies still have hardcoded English strings. The `t()` infrastructure is in place so subsequent commits can replace individual strings without restructuring.
- **RTL text direction support** — Amharic is LTR so this is not strictly needed, but §4.9.5 mentions "RTL text direction support prepared for future extension to additional languages" — could add `dir="rtl"` switching if Arabic/Farsi are added later.
