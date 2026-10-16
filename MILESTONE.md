# DLPMS Milestone 3 — Identity, Audit, Parcels, Admin

This milestone extends the M2 foundation with the security, audit, RBAC, and
core land-registry scaffolding required to support real workflows. It does
**not** implement transfers, tax/payment, GIS boundary verification, appointments,
or notifications dispatch — those remain reserved for later milestones per
the blueprint documents.

## What was added

### Data layer
- `prisma/schema.prisma` — full entity catalogue from `DATABASE_DESIGN.md` with
  `postgresql` provider per `PROJECT_DECISIONS.md`. Boundary geometry is `Json?`
  pending the PostGIS extension milestone; the production schema will replace
  `boundaryJson` with `Unsupported("geometry(Polygon,4326)")` plus a GiST index.
- `prisma/seed.js` — creates the five seeded roles (`Citizen`, `LandOfficer`,
  `TaxOfficial`, `GISOfficer`, `SystemAdmin`) and a bootstrap `SystemAdmin`
  user. Safe to re-run.
- `docker-compose.yml` — local `postgis/postgis:15-3.4` instance for development.

### Identity & access module
- `POST /auth/register` — citizen self-registration with phone + password;
  creates the linked `OwnerProfile`. Generic conflict error to prevent enumeration.
- `POST /auth/login` — phone/email + password; generic 401 on any failure.
- `POST /auth/otp/request` and `POST /auth/otp/verify` — OTP behind a mock
  adapter (`lib/otpProvider.js`). In non-production the dev code is returned
  for testing only; in production the response is `{delivered: true}` with no code.
- `POST /auth/token/refresh` — refresh-token rotation. The current refresh JTI is
  stored on `users.lastRefreshTokenJti`; rotation invalidates the previous JTI.
- `POST /auth/logout` — clears the refresh JTI so the previous token cannot be
  used (revocation path).

### Authorization & audit middleware
- `middleware/auth.js` — `requireAuth` verifies HS256 JWT access tokens, loads
  user + role, attaches `request.user`/`request.role`. Returns a generic 401
  for any auth failure.
- `requireRoles(...codes)` — RBAC guard. Applied at the route level on all
  mutating endpoints. Domain services re-check ownership (see parcels).
- `middleware/auditMiddleware.js` — `writeAudit(request, action, fields)`
  helper that creates an `AuditLog` entry with SHA-256 hash chain. Each
  entry stores `previousHash` (from the latest row's `entryHash`) and computes
  `entryHash` over the canonical JSON payload. `verifyAuditChain` re-walks
  the chain and detects tampering. Audit writes are append-only in application
  code (no UPDATE/DELETE in service modules).

### Parcels module (`/parcels`)
- `GET /parcels` — paginated, filterable by sub-city/kebele/owner/search.
- `GET /parcels/{id}` — includes ownership history and properties.
- `POST /parcels` — LandOfficer/SystemAdmin create. Wraps parcel + initial
  ownership history in a Prisma `$transaction` (NFR-06 ACID). Rejects duplicate
  parcel numbers per `DATABASE_DESIGN.md` business rule.
- `PATCH /parcels/{id}` — requires `expectedVersion`; stale writes return `409`
  Conflict (optimistic concurrency, `SECURITY_DESIGN.md`).
- `GET /parcels/{id}/ownership-history` — chain of past and current owners.

### Profile module (`/me`)
- `GET /me` — authenticated user + owner profile snapshot.
- `PATCH /me` — update contact fields and `preferredLanguage`. Bumps the
  `ownerProfile.version` for optimistic-concurrency support.

### Admin module (`/admin/*`)
- `GET /admin/users`, `GET /admin/users/{id}`, `GET /admin/roles` — listing +
  detail (SystemAdmin only).
- `PATCH /admin/users/{id}/role` — role assignment with audit write.
- `POST /admin/users/{id}/deactivate` — sets `active=false` and clears the
  refresh JTI. Self-deactivation is rejected.

### Audit module (`/admin/audit-logs`)
- `GET /admin/audit-logs` — paginated, filterable by actor/action/entity/date.
- `GET /admin/audit-logs/export` — CSV export (sensitive snapshot fields are
  excluded; admins fetch individual entries for forensic review).
- `GET /admin/audit-logs/verify` — recomputes the SHA-256 chain and reports
  the first broken entry (or `ok: true`).

### OpenAPI documentation (`NFR-10`)
- `/api-docs` served by `swagger-ui-express`; spec extended with all new
  endpoints, security scheme, error response catalog.

## Security controls implemented

| SECURITY_DESIGN.md rule | Where |
|---|---|
| bcrypt cost factor 12 | `utils/security.js` `hashPassword` |
| JWT 15-min access / 7-day refresh | `utils/security.js` `issueAccessToken` / `issueRefreshToken` |
| Generic auth failures | `middleware/auth.js` and `identityService.js` |
| Refresh-token rotation/revocation | `identityService.refresh` and `logout` |
| RBAC at route + service layer | `requireRoles` + per-service ownership checks |
| Audit of all CRUD/auth events | `middleware/auditMiddleware.js` |
| SHA-256 tamper-evident audit chain | `lib/auditLog.js` |
| Optimistic concurrency (409 Conflict) | `parcelsService.patchParcel` (`expectedVersion`) |
| ACID transactions for multi-step writes | `parcelsService.createParcel` uses `db.$transaction` |
| Helmet, rate limiting, request size limit | `app.js` (`helmet`, `express-rate-limit`, `100kb` body) |
| OTP behind an adapter | `lib/otpProvider.js` (mock) |

## How to run

```bash
# 1. Copy env and set a strong JWT_SECRET (>=32 chars)
cp .env.example .env

# 2. Start Postgres/PostGIS
docker compose up -d db

# 3. Install + generate Prisma client
npm install

# 4. Apply migrations
npm --workspace @dlpms/api run prisma:migrate

# 5. Seed roles + bootstrap admin
npm --workspace @dlpms/api run seed

# 6. Start the API
npm run dev:api
```

API: `http://localhost:4000/api/v1`
Docs: `http://localhost:4000/api-docs`

## What is intentionally NOT in this milestone

- Transfers (`/transfers/*`), tax/payment (`/tax-records`, `/payments/*`)
- GIS boundary verification (`/gis/*`), PostGIS spatial queries
- Appointments (`/appointments`, `/appointment-slots`)
- Certificates (`/certificates/*`)
- Document uploads (`/documents/*`)
- Notifications dispatch (`/notifications`)
- CIS adapter (production contract pending)
- Frontend integration (citizen PWA + staff portal remain M2 placeholders)

These remain governed by the blueprint documents and will be addressed in
subsequent milestones.
