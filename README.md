# Digital Land and Property Management System (DLPMS)

This repository contains the foundation for the Dire Dawa DLPMS university project. It follows the approved modular-monolith architecture in the project blueprint documents.

## Applications

- `apps/citizen-pwa` — React/Vite citizen Progressive Web App placeholder.
- `apps/staff-portal` — React/Vite staff portal placeholder.
- `apps/api` — Node.js/Express REST API.
- `packages/shared-types` — dependency-free shared constants/types placeholder.
- `prisma` — Prisma schema + seed for the full entity catalogue (DATABASE_DESIGN.md).
- `infrastructure` — reserved for deployment/operational assets.

## Milestone 11 (current)

Closes the audit-trail gaps identified in M10's deferred-items list. Every item maps to the exact PDF reference:
- **NFR-07** audit-on-views for sensitive GETs (parcels, transfers, documents, certificates, payments)
- **FR-02** OTP required on login by default (was opt-in)
- **§4.3 sub-system 7** notification retry processor with exponential backoff (30s → 2m → 8m → 32m → 128m, cap 5 retries)
- **FR-27** new `/admin/settings` endpoints (tax rates, fees, appointment window, notification templates) — SystemAdmin
- **FR-15, FR-21, §4.3 sub-system 6** new `/reports/{registrations,transfers,tax-compliance,operations}` with date + subCity filters + CSV export
- **FR-10** new `/public/parcels/search` — public, no auth, rate-limited (20/min/IP), returns only public fields (NO owner name/national ID/contact per PROJECT_DECISIONS.md privacy deference)

3 new AuditAction values: `SettingsUpdate`, `ReportView`, `PublicSearch`.

UI: staff portal Settings page + Reports page; citizen PWA Public Search page (accessible without auth). OpenAPI now 63 endpoints. See `MILESTONE.md` for the full scope.

## Earlier milestones

- **M10** — workflow correctness audit (7 logical flaws fixed in transfer + payment state machines).
- **M9** — citizen PWA document upload UI + staff portal Leaflet map UI.
- **M8** — frontend integration (citizen PWA + staff portal wired to the API).
- **M7** — *(skipped; PostGIS swap deferred)*
- **M6** — document uploads + transfer-document review.
- **M5** — appointments, certificates (PDF + QR), notifications + 24h reminders.
- **M4** — transfers, tax, GIS, payments, webhooks.
- **M3** — identity, RBAC, audit hash chain, parcels, profile, admin users, audit-read endpoints.
- **M2** — initial modular-monolith scaffold.

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- Docker (for local Postgres/PostGIS) or a reachable PostgreSQL 15+ / PostGIS 3.3+ instance

## Setup

```bash
# Copy env and set a strong JWT_SECRET (>= 32 chars)
cp .env.example .env

# Start a local Postgres/PostGIS instance
docker compose up -d db

# Install (also generates the Prisma client via postinstall)
npm install
```

## Run the database migrations + seed

```bash
npm --workspace @dlpms/api run prisma:migrate   # creates schema from prisma/schema.prisma
npm --workspace @dlpms/api run seed              # seeds roles + bootstrap SystemAdmin
```

## Run locally

Use three terminals:

```bash
npm run dev:api
npm run dev:citizen
npm run dev:staff
```

- API health: `http://localhost:4000/api/v1/health`
- API documentation: `http://localhost:4000/api-docs`
- Citizen PWA: Vite prints its local URL (normally `http://localhost:5173`)
- Staff portal: Vite prints its local URL (normally `http://localhost:5174` if 5173 is occupied)

## Verification

```bash
npm run lint
npm run build
npm run check
```

## Future milestones

Per the blueprint documents, subsequent milestones will add transfers, tax/payment, GIS verification, appointments, certificates, document uploads, notifications dispatch, and frontend integration with the API. See `MILESTONE.md` for the boundary of what is and is not implemented in M3.
