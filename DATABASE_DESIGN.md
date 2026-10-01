# DLPMS Conceptual Database Design

This is a conceptual ERD/data blueprint only. It precedes and must be validated before Prisma schema creation. IDs are UUID primary keys unless an external identifier is explicitly represented separately. All mutable operational entities include `createdAt`, `updatedAt`, and integer `version` optimistic-lock fields unless stated otherwise.

## Entity catalogue

| Entity | Key attributes and constraints |
|---|---|
| Role | `id`, unique `code`, name, description, timestamps. Seeded roles are Citizen, LandOfficer, TaxOfficial, GISOfficer, SystemAdmin. |
| User | `id`, role FK, phone number, email, password hash, active flag, OTP/account-verification fields, preferred language, timestamps, version. Unique normalized phone; unique normalized email when present. |
| OwnerProfile | `id`, user FK (unique), full name, unique national ID, physical address, contact fields, timestamps, version. Represents an ownership-capable citizen profile. |
| LandParcel | `id`, unique parcel number, current owner FK, location/kebele/sub-city values, declared size, land-use type, boundary `geometry(Polygon,4326)`, boundary status, timestamps, version. |
| Property | `id`, parcel FK, documented property/type/assessment attributes where applicable, timestamps, version. The document requires property data/tax by property type but does not fully specify its fields. |
| OwnershipHistory | `id`, parcel FK, owner FK, acquired date, acquisition method, start/end date, source transfer FK nullable, timestamps. Records historical chains; one active ownership record per parcel is an integrity rule to enforce. |
| TransferRequest | `id`, unique tracking ID, parcel FK, seller owner FK, buyer user/owner reference, buyer-entered identity snapshot, sale price, status, officer FK nullable, submitted/reviewed/decision timestamps, decision reason, timestamps, version. |
| TransferDocument | `id`, transfer FK, document-metadata FK, document type, verification status/reason, verified by FK nullable, timestamps, version. |
| TaxRecord | `id`, parcel FK, tax year, calculated amount, paid amount, credit balance, status/tax-hold state, calculation inputs/snapshot, timestamps, version. Unique `(parcel_id, tax_year)`. |
| PaymentTransaction | `id`, tax record FK, payer user/owner FK, unique transaction reference, amount, method, status, provider reference, provider payload JSON, initiated/completed timestamps, timestamps, version. |
| Appointment | `id`, citizen/owner FK, assigned land officer FK, service type, scheduled time, status, purpose/details, cancellation reason, timestamps, version. Index officer and scheduled time. |
| Notification | `id`, recipient user FK, channel, template/key, payload snapshot, status, scheduled/sent timestamps, retry metadata, provider reference, timestamps. |
| AuditLog | append-only `id`, actor user FK nullable for system event, action, entity type/id, request/correlation ID, IP address, old/new JSON snapshots, previous hash, entry hash, created timestamp. No update/delete in application logic. |
| Certificate | `id`, parcel FK, owner FK, optional transfer FK, document-metadata FK, certificate number, status, issued/revoked timestamps, QR/reference data, timestamps. Unique certificate number. |
| DocumentMetadata | `id`, owner user FK, storage adapter/key, original/safe filename, media type, byte size, checksum, classification, scan/validation status, uploaded timestamp, timestamps, version. |

Supporting configuration/audit support is also required: configurable tax rates/fees, appointment slot definitions, notification templates, and system settings. The exact tax formula and appointment cancellation window remain configuration/business-policy decisions, not hard-coded schema rules.

## Principal relationships

- Role 1—N User.
- User 1—0..1 OwnerProfile.
- OwnerProfile 1—N LandParcel as current owner; historical ownership is modeled by OwnershipHistory.
- LandParcel 1—N Property; exact cardinality must be confirmed because the PDF does not define whether a parcel may have multiple property records.
- LandParcel 1—N OwnershipHistory; OwnerProfile 1—N OwnershipHistory.
- LandParcel 1—N TransferRequest; each transfer references seller, buyer, and optional assigned Land Officer.
- TransferRequest 1—N TransferDocument; TransferDocument N—1 DocumentMetadata.
- LandParcel 1—N TaxRecord (one per year); TaxRecord 1—N PaymentTransaction.
- User/OwnerProfile 1—N Appointment; Land Officer User 1—N Appointment.
- User 1—N Notification and AuditLog.
- LandParcel/OwnerProfile/TransferRequest may each relate to Certificate.
- DocumentMetadata is referenced by transfer documents and generated-file records, but storage ownership/access is centrally controlled.

## Status fields

- Transfer: `DRAFT`, `SUBMITTED`, `TAX_VERIFIED`, `TAX_HOLD`, `UNDER_REVIEW`, `DOCUMENTS_REQUESTED`, `APPROVED`, `REJECTED`, plus documented cancellation handling.
- Payment: `INITIATED`, `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `REFUNDED`.
- Boundary: at minimum pending, verified, and overlap/conflict as shown by the UI description; exact enum labels are a technical decision.
- Document review, appointment, notification, certificate, and tax-record statuses need controlled enums; labels not specified in the PDF must be finalized before schema implementation.

## Integrity, indexes, and spatial design

- Unique indexes: normalized `users.email` (when supplied), `users.phone_number`, `owners.national_id`, `land_parcels.parcel_number`, `transfer_requests.tracking_id`, `payment_transactions.transaction_ref`, `certificates.certificate_number`, and `(tax_records.parcel_id, tax_year)`.
- B-tree indexes: parcel current owner, transfer status, tax/appointment filtering, notification dispatch status, and audit `(actor_user_id, created_at)`.
- PostGIS: `LandParcel.boundary` is `geometry(Polygon, 4326)` with a GiST index. Implement point-in-polygon, intersection/overlap checking, and area calculation through PostGIS. The database does not assume declared parcel size equals calculated geometry area.
- GeoJSON is an accepted interchange format. Shapefile import is an application workflow that validates/converts source geometry before saving WGS84 polygon data.
- Transfer approval, ownership-history close/create, certificate issuance, audit entry, and required tax checks must be performed atomically.
- Version checks return a conflict response when an expected version is stale.

## Audit and privacy requirements

Every critical create/update/delete/view action identified by the requirements must create an audit entry with actor, time, IP, action, target, and old/new snapshots where applicable. Each entry includes the prior hash and its own SHA-256 hash. Uploaded ownership documents and private owner attributes are not public data; references must be authorized server-side and short-lived delivery mechanisms are a future implementation detail.

