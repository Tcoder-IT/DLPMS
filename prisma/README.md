# DLPMS Prisma

- `schema.prisma` — full entity catalogue from `../DATABASE_DESIGN.md`, `postgresql` provider per `../PROJECT_DECISIONS.md`. Boundary geometry is currently `Json?`; the production schema will replace `boundaryJson` with `Unsupported("geometry(Polygon,4326)")` plus a GiST index when migrations are applied against a PostGIS-enabled database.
- `seed.js` — creates the five seeded roles (`Citizen`, `LandOfficer`, `TaxOfficial`, `GISOfficer`, `SystemAdmin`) and a bootstrap `SystemAdmin` user. Safe to re-run (uses `upsert`/idempotency-by-unique).

## Quick start

```bash
# 1. Start a local Postgres/PostGIS instance:
docker compose up -d db

# 2. Copy env and adjust JWT_SECRET:
cp .env.example .env

# 3. Install (generates the Prisma client):
npm install

# 4. Apply migrations (creates the schema):
npm --workspace @dlpms/api run prisma:migrate

# 5. Seed roles + admin:
npm --workspace @dlpms/api run seed

# 6. Run the API:
npm run dev:api
```

## Notes

- The Prisma client is generated at install time (`postinstall` hook). The API imports it from `node_modules/.prisma/client` via `@prisma/client`.
- The schema is `postgresql`-provider; do not switch to SQLite for this project per `PROJECT_DECISIONS.md`. For local development without Docker, install Postgres 15+ directly.
- Migrations are committed under `prisma/migrations/` once `prisma migrate dev` has been run against a reachable database. Until then the schema is authoritative.
