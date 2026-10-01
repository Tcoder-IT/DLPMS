# DLPMS Security Design

## Authentication and token security

- Use phone/email plus password and OTP as specified. OTP delivery and verification are behind an adapter; development uses a mock provider and never embeds credentials.
- Store passwords only as bcrypt hashes with cost factor 12. Never log credentials, OTPs, reset tokens, or bearer tokens.
- Issue short-lived JWT access tokens (the detailed design states 15 minutes) and refresh tokens (7 days). Refresh-token storage/revocation mechanism is an implementation decision that must support logout and compromise response.
- Require TLS 1.2+ for all client/API/provider communication. HSTS, secure cookies where cookies are used, and strict CORS policy are applied at the API edge.
- Secrets, database URLs, keys, provider configuration, and signing material reside only in environment variables or approved deployment secret storage; no fake or live credentials belong in source control.

## Authorization/RBAC and privacy

- Enforce RBAC centrally and again in domain services: Citizen, LandOfficer, TaxOfficial, GISOfficer, SystemAdmin.
- Citizens may access only records they own or are explicitly authorized to act on. Server-side ownership checks apply to parcels, transfers, tax records, payments, appointments, certificates, and documents.
- Staff operations are least-privilege; role membership alone does not bypass parcel/workflow authorization.
- Administrators manage users/settings/audit/operations; elevated actions are audited.
- Public search is a separate, allowlisted read model. Its exposed fields are pending a business/privacy decision, so ownership documents and private owner data are excluded by default.

## API and input protection

- Use Helmet, rate limiting, strict request-size limits, schema validation, and sanitization at the API layer.
- Permit known content types and reject unknown fields where appropriate. Validate UUIDs, enums, pagination, file metadata, geometry, and status transitions server-side.
- Use Prisma parameterized queries/ORM protections; do not build SQL from request strings. PostGIS operations use validated parameters.
- Implement abuse controls for login, OTP, password recovery, uploads, public search, and webhook endpoints. Exact thresholds are deployment policy, not specified business rules.
- Provide generic authentication failures and avoid user/account enumeration.

## File and document security

- Upload through authenticated, authorized endpoints only. Validate file type by content inspection, extension, MIME type, size limit, and checksum; reject executable/unsupported content.
- Store files in private external storage; retain controlled metadata/reference, not public paths, in the database.
- Authorize every download server-side. Malware scanning/quarantine and final file limits are implementation/deployment decisions pending policy, but the design reserves validation status for them.
- Treat IDs, deeds, sale agreements, and tax clearances as sensitive. Do not expose them through public search, audit exports, logs, or URLs.

## Audit logging and integrity

- Audit all CRUD actions, including views, with timestamp, actor/user ID, IP address, action, target entity/record, request correlation ID, and old/new values for critical changes.
- Make logs append-only in application permissions. Each entry links to the prior hash and stores a SHA-256 entry hash to make alterations evident.
- Audit authorization failures, privileged administration, approval/rejection, ownership changes, payments/refunds, boundary updates, document reviews, and configuration changes.
- Restrict audit viewing/export to SystemAdmin and redact sensitive data from outputs when not necessary.

## Payment and integration security

- Payment processing uses a provider-neutral adapter. The prototype uses mock/sandbox services only and never initiates real financial transactions.
- Verify provider webhook signatures, timestamp/replay protections where supported, provider references, and expected amount/state before changing tax/payment data.
- Make callback processing idempotent through unique transaction/provider references. Failed validation is recorded and triggers the documented administrative investigation path.
- CIS, SMS, email, and storage adapters have least-privilege credentials, timeouts, retries, structured failure handling, and no direct access from the frontend.

## Concurrency and data integrity

- Require expected `version` on editable resources and reject stale edits with `409 Conflict`.
- Execute transfer approval, ownership updates, tax-hold changes, receipt/certificate state, and audit writes in ACID transactions.
- Use database uniqueness and spatial constraints/checks as a final defense against duplicate IDs, duplicate payment processing, tax-record duplication, double booking, and conflicting geometry.

