# DLPMS Project Decisions, Assumptions, and Open Issues

## Recorded technology decision

The detailed requirements/design chapters are authoritative for implementation: React, Tailwind CSS, PWA, React Router, Leaflet; Node.js/Express REST API; PostgreSQL/PostGIS; Prisma; JWT, bcrypt, Helmet, rate limiting, validation/sanitization, OpenAPI, external file storage, and audit logging.

The feasibility section of the PDF separately mentions PHP/Laravel and MySQL. This conflicts with the detailed architecture, software-requirements table, and conclusion. **Decision:** do not use Laravel or MySQL; use the detailed-stack decision above.

## Architecture decisions

- Use a modular monolith, not microservices.
- Implement all live integrations behind provider-neutral adapter interfaces.
- Initial telebirr, SMS, email, external file storage, and DDLA CIS adapters are mock/sandbox implementations only. No live credentials, real financial transactions, or production CIS writes are permitted initially.
- PostgreSQL/PostGIS is the DLPMS database. CIS remains a separate legacy system; the exact interface/ownership and read/write synchronization contract are unknown.
- Tax rates/fees and appointment configuration are settings, not hard-coded values.

## Explicitly unresolved requirements

| Topic | What is known | Required decision/assumption boundary |
|---|---|---|
| Public search | Search by parcel ID, owner name, or location is mentioned. | Which fields are public, whether owner name is truly public, consent/legal basis, result granularity, rate limits, and anti-enumeration rules. Until decided, expose no private ownership/document data. |
| Appointment cancellation | Cancellation is allowed only within a permissible window. | Exact window is not defined. Make it configurable; do not assume a duration. |
| Tax formula | Area, location, property type, configurable tax rates/fees are stated. | Rate table, zones, surcharges, penalties, exemptions, due dates, rounding, and credit-balance treatment need policy. |
| Property model | Property details/type influence tax. | Full property fields and whether multiple properties may belong to a parcel are unspecified. |
| Buyer eligibility | Transfer approval validates it. | Eligibility criteria and identity-verification source are not defined. |
| Required documents | Examples are sale agreement, IDs, deeds, tax clearance, photos/forms. | Document checklist by service, formats/size limits, retention, and authenticity-verification rules need confirmation. |
| Certificate signature/QR | Certificate is digitally signed, watermarked, and QR-enabled. | Legal signing authority, key management, QR payload, verification endpoint, revocation/reissue rules are unspecified. |
| CIS integration | REST adapter is proposed to read spatial/land records and synchronize. | Actual CIS API/database access, field mapping, source-of-truth ownership, failure recovery, and permitted writes are unknown. |
| Providers | telebirr, Africa's Talking/Twilio, and email are named/anticipated. | Sandbox contract, provider selection, credentials, callback format, sender IDs, delivery/consent rules need external approval. |
| Backup/restore | Daily backup, 30-day retention, monthly restore test. | Backup location, encryption, access control, RPO/RTO, production operator authorization remain deployment decisions. |
| Legal compliance | Ethiopian land laws and Dire Dawa policy are referenced. | Exact statutory validation rules and records-retention/privacy obligations must come from DDLA/legal stakeholders. |
| GIS source data | GeoJSON/Shapefile, WGS84, overlaps/gaps are specified. | Authoritative cadastral layer, permitted geometry repair, accuracy tolerance, and gap definition are not specified. |
| Transfer status model | Eight named states plus cancellation behavior are documented. | Whether `Cancelled` is stored in the enum and any reopen/appeal process must be decided; no appeal workflow is documented. |
| Notifications | SMS/email statuses/reminders are required. | Templates, language fallback, consent, retry caps, delivery retention, and failure escalation need configuration/policy. |

## Non-assumptions

- No historical-paper-record migration is included in this prototype scope.
- No native Android/iOS application is required; the selected citizen channel is a PWA.
- No blockchain, OCR/AI, satellite imagery, 3D GIS, national-ID integration, Docker/Kubernetes, or additional languages are baseline requirements; they are future recommendations only.
- No direct public document URLs, fake credentials, production payment transactions, or production external integrations will be created.

