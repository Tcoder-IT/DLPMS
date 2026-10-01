# DLPMS REST API Design

Base path: `/api/v1`. The API is a single Express modular-monolith API. JSON is the normal representation; multipart upload is used only for permitted document/boundary uploads. OpenAPI 3.0 documents all endpoints at `/api-docs`.

## API conventions

- JWT bearer authentication protects non-public routes. RBAC is enforced at route and service layers.
- Mutable-resource requests carry an expected `version`; stale writes return `409 Conflict`.
- List endpoints support pagination, safe filtering, and role-authorized sorting.
- Errors use a consistent code/message/details shape; private details are never exposed.
- Provider webhooks are isolated from user-facing routes and use adapter-specific signature validation.

## Modules and endpoint groups

| Module | Main endpoint groups | Access |
|---|---|---|
| Identity | `POST /auth/register`, `/auth/login`, `/auth/otp/verify`, `/auth/token/refresh`, `/auth/logout`, `/auth/password/*` | Public/citizen as applicable |
| Profile | `GET/PATCH /me`, `GET /me/parcels`, `GET /me/certificates`, `GET /me/payments` | Authenticated owner |
| User/role admin | `GET/POST/PATCH /admin/users`, `PATCH /admin/users/{id}/role`, `/deactivate`, `GET /admin/roles` | SystemAdmin |
| Public search | `GET /public/parcels/search` | Public fields only; exact fields pending policy |
| Parcel/land registry | `GET /parcels`, `GET /parcels/{id}`, `POST /parcels`, `PATCH /parcels/{id}`, `GET /parcels/{id}/ownership-history` | Role-specific |
| Properties | `GET/POST/PATCH /parcels/{id}/properties` | Staff role-specific |
| Transfers | `GET/POST /transfers`, `GET/PATCH /transfers/{id}`, `POST /transfers/{id}/submit`, `/cancel`, `/request-documents`, `/approve`, `/reject` | Citizen/land officer as applicable |
| Transfer documents | `POST /transfers/{id}/documents`, `GET /transfers/{id}/documents`, `POST /transfer-documents/{id}/review` | Authorized citizen/officer |
| Tax | `GET /tax-records`, `GET /parcels/{id}/tax-records`, `POST /tax-records/{id}/calculate`, `POST /tax-records/{id}/offline-payments`, `GET /tax/dashboard`, `GET /tax/arrears` | TaxOfficial/admin; owner read of own data |
| Payments | `POST /payments/initiate`, `GET /payments/{id}`, `POST /payments/{id}/refund` | Owner/admin as documented |
| Payment webhook | `POST /webhooks/payments/{provider}` | Provider adapter only; signed request required |
| GIS | `GET /gis/parcels`, `GET /gis/parcels/{id}/boundary`, `PUT /gis/parcels/{id}/boundary`, `POST /gis/boundaries/import`, `POST /gis/parcels/{id}/verify`, `GET /gis/overlaps` | GISOfficer |
| Appointments | `GET/POST /appointments`, `GET/PATCH /appointments/{id}`, `POST /appointments/{id}/cancel`, `/reschedule`, `GET/POST /appointment-slots` | Citizen/staff role-specific |
| Certificates | `GET /certificates/{id}`, `POST /certificates/{id}/download` | Authorized holder/staff |
| Documents | `POST /documents`, `GET /documents/{id}` | Authorized uploader/reviewer only |
| Notifications | `GET /notifications`, `PATCH /notifications/{id}/read`, `GET /admin/notification-templates` | User/admin |
| Audit | `GET /admin/audit-logs`, `GET /admin/audit-logs/export` | SystemAdmin |
| Reports | `GET /reports/registrations`, `/transfers`, `/tax-compliance`, `/operations`, `/export` | Authorized staff/admin |
| Settings/operations | `GET/PATCH /admin/settings`, `POST /admin/backups`, `POST /admin/restores` | SystemAdmin |

## Deliberate API deferrals

Exact public-search response fields, CIS synchronization/write endpoints, real payment-provider payloads, SMS/email provider endpoints, and certificate signature verification format are unspecified. Adapter contracts and endpoint schemas must be finalized after their respective policies/contracts are obtained.

