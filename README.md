# Digital Land and Property Management System (DLPMS)

This repository contains the foundation for the Dire Dawa DLPMS university project. It follows the approved modular-monolith architecture in the project blueprint documents.

## Applications

- `apps/citizen-pwa` — React/Vite citizen Progressive Web App placeholder.
- `apps/staff-portal` — React/Vite staff portal placeholder.
- `apps/api` — Node.js/Express REST API.
- `packages/shared-types` — dependency-free shared constants/types placeholder.
- `prisma` — Prisma schema + seed for the full entity catalogue (DATABASE_DESIGN.md).
- `infrastructure` — reserved for deployment/operational assets.

## Milestone 9 (current)

Fills the two biggest UX gaps from M8: a citizen PWA Documents page with multipart upload + inline attach-to-transfer form, and a staff portal GIS page with a real Leaflet map (draw-on-map + GeoJSON file upload + verify against neighbours). Adds a new `GET /documents` API endpoint (paginated, ownership-scoped). See `MILESTONE.md` for the full scope.

## Earlier milestones

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
