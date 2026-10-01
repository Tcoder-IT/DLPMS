# Digital Land and Property Management System (DLPMS)

This repository contains the foundation for the Dire Dawa DLPMS university project. It follows the approved modular-monolith architecture in the project blueprint documents.

## Applications

- `apps/citizen-pwa` — React/Vite citizen Progressive Web App placeholder.
- `apps/staff-portal` — React/Vite staff portal placeholder.
- `apps/api` — Node.js/Express REST API foundation.
- `packages/shared-types` — dependency-free shared constants/types placeholder.
- `prisma` — reserved for the approved Prisma schema and migrations; no schema exists in Milestone 2.
- `infrastructure` — reserved for deployment/operational assets.

## Prerequisites

- Node.js 22 or later
- npm 10 or later

## Setup

```powershell
Copy-Item .env.example .env
npm.cmd install
```

## Run locally

Use three terminals:

```powershell
npm.cmd run dev:api
npm.cmd run dev:citizen
npm.cmd run dev:staff
```

- API health: `http://localhost:4000/api/v1/health`
- API documentation: `http://localhost:4000/api-docs`
- Citizen PWA: Vite prints its local URL (normally `http://localhost:5173`)
- Staff portal: Vite prints its local URL (normally `http://localhost:5174` if 5173 is occupied)

## Verification

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run check
```

## Milestone 2 limits

No authentication, land registration, Prisma schema, payment, SMS, email, or production CIS integration is implemented. Those capabilities remain governed by the blueprint documents in the repository root.
