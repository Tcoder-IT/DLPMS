# DLPMS Modular Monolith Architecture

## Architectural decision

DLPMS will be a **modular monolith**: one deployable Node.js/Express backend, one PostgreSQL/PostGIS database, and independently deployable React frontends/PWA as appropriate. Modules are isolated by interfaces and folders, not deployed as microservices. This preserves the documented five-tier design while avoiding unnecessary operational complexity.

External dependencies (CIS, telebirr, SMS, email, and file storage) are accessed only through adapters. Initial adapters use mocks/sandbox implementations; no live credentials or financial operations are included.

## Five tiers

### 1. Presentation layer

- Citizen React PWA: citizen records, transfer submission, tax/payment experience, appointments, certificates, profile, language selection.
- Staff React web portal: Land Officer, Tax Official, GIS Officer, and Admin workspaces.
- Leaflet GIS user interface: map rendering, parcel selection, drawing/editing and boundary upload.
- React Router governs client-side routes; Tailwind CSS provides responsive accessible styling.
- Presentation clients call the API only over HTTPS and never access the database, storage, CIS, or payment provider directly.

### 2. API gateway/API layer

Express middleware is the single application entry point. It supplies routing, JWT verification, RBAC guards, rate limits, request correlation IDs, schema validation/sanitization, error normalization, OpenAPI documentation, CORS policy, Helmet headers, and webhook routes. It does not contain domain decisions.

### 3. Business logic layer

Feature modules own use cases and transaction boundaries:

- identity and access
- user/owner profiles
- land/property/ownership registry
- transfer workflow
- tax and payments
- GIS boundary management
- appointments
- document/certificate handling
- notifications
- audit/reporting
- settings/administration

Modules communicate through explicit service interfaces/events in-process. A domain service may not reach into another module's persistence implementation.

### 4. Data access and integration layer

- Prisma repositories encapsulate database queries and PostgreSQL transactions.
- GIS repository exposes PostGIS operations, not raw spatial SQL to controllers.
- CIS adapter exposes a normalized read/synchronization interface. Its initial implementation is a mock; the production contract is pending DDLA confirmation.
- Payment, SMS, email, and file-storage adapters expose provider-neutral interfaces. Their initial implementations are mocks/sandbox adapters.
- Certificate generator and notification dispatcher are interfaces behind application services.

### 5. Data layer

- PostgreSQL 15+ is the system-of-record database; PostGIS 3.3+ stores parcel geometry.
- External/private file storage holds uploads, generated certificates, and receipts. Database records store controlled references and metadata, never public direct URLs.
- Existing CIS remains a separate legacy data source, accessed through its adapter.
- Backup/restore, retention, WAL/PITR, and monitoring are deployment concerns aligned to NFR-08.

## Cross-cutting architecture

- All critical business changes execute in PostgreSQL transactions and generate audit entries in the same unit of work where feasible.
- Audit log entries are chained with SHA-256 hashes for tamper evidence.
- Optimistic version columns protect editable records from lost updates.
- Configuration/secrets are environment variables; configurable tax/fee/appointment/public-search settings are persisted and administrator-controlled with audit records.
- Background scheduling remains inside the monolith (for reminders, retry dispatch, and backups), not a separate microservice.

## Boundaries deliberately deferred

The PDF does not define actual CIS API/database contract, public-search exposure rules, telebirr credentials/contract, SMS/email provider choice, or a certificate-signing authority. Adapters prevent these decisions from leaking into core business modules.

