# Digital Land and Property Management System (DLPMS)

This repository contains the foundation for the Dire Dawa DLPMS university project. It follows the approved modular-monolith architecture in the project blueprint documents.

## Applications

- `apps/citizen-pwa` — React/Vite citizen Progressive Web App placeholder.
- `apps/staff-portal` — React/Vite staff portal placeholder.
- `apps/api` — Node.js/Express REST API.
- `packages/shared-types` — dependency-free shared constants/types placeholder.
- `prisma` — Prisma schema + seed for the full entity catalogue (DATABASE_DESIGN.md).
- `infrastructure` — reserved for deployment/operational assets.

## Milestone 10 (current)

Correctness audit + workflow completion. Fixes 7 logical flaws in the M3–M9 implementation that violated the PDF state charts (§4.5.1 Land Transfer, §4.5.2 Payment):
- `submitTransfer` now runs the auto-tax-check (→ TaxHold or UnderReview)
- `TaxHold → Submitted` recovery loop (was wrongly → TaxVerified)
- `applyCompletedPayment` auto-advances TaxHold transfers on the parcel
- `createParcel` atomically issues the initial Certificate (UC-02 step 9)
- Webhook transitions Pending → Processing → Completed with amount verification
- 15-min payment timeout sweeper marks stuck payments Failed + notifies admin
- New receipt PDF generator (UC-03 step 9) at `GET /payments/{id}/receipt.pdf`

New UI: citizen PWA Payments page (initiate telebirr + replay webhook + download receipt), staff portal parcel detail page, staff portal appointments management page. See `MILESTONE.md` for the full audit.

## Earlier milestones

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
