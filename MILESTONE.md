# DLPMS Milestone 6 — Document Uploads + Transfer-Document Review

Builds on M5 (appointments + certificates + notifications) by implementing
the document upload pipeline and transfer-document review workflow per
FR-05 (upload), FR-12 (verify), and `WORKFLOWS.md §7`. Per
`SECURITY_DESIGN.md` (File and document security), uploads are
authenticated and authorized, files are validated by content inspection
(magic bytes) + extension + MIME type + size + checksum, executables are
rejected, files live in private external storage, and **every** download
is server-side authorized.

## What was added

### Storage adapter (mock local filesystem)
`apps/api/src/lib/storageAdapter.js` — provider-neutral adapter per
`AGENTS.md`. Files live under `STORAGE_ROOT` (default:
`/home/z/my-project/storage/dlpms-docs`) in a 2-level prefix layout
(`${2-char-prefix}/${uuid}${ext}`) to avoid a flat directory at scale.
Storage keys are validated by regex on every read to prevent path
traversal. Production swaps this for S3/NAS without changing the
`DocumentMetadata` schema (`storage_adapter` + `storage_key` remain
stable).

### Documents module (`/documents`)
- `POST /documents` — multipart/form-data upload. The pipeline:
  1. **multer** pre-filters MIME type (defense in depth) and enforces a
     10 MB size limit at the multipart layer.
  2. The service re-checks magic bytes against allowed signatures (PDF
     `%PDF-`, PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`).
  3. Extension allowlist (`pdf`, `png`, `jpg`, `jpeg`) plus an explicit
     **blocklist** for executables/scripts/archives (`exe`, `dll`, `so`,
     `sh`, `js`, `py`, `php`, `zip`, `tar`, `gz`, …).
  4. **MIME/extension must match magic bytes** — a PDF header with a
     `.png` extension is rejected.
  5. SHA-256 checksum is computed and stored on `DocumentMetadata.checksum`.
  6. `classification = 'restricted'` by default per the existing schema.
  7. `scanStatus = 'pending'` — malware scanning is a deployment decision
     per `SECURITY_DESIGN.md`, so the schema reserves the field.
  8. Upload is audit-logged.
- `GET /documents/{id}` — metadata only, ownership-checked (uploader
  OR officer/admin OR document is attached to a transfer where the
  citizen is a party). Never returns the file content.
- `GET /documents/{id}/content` — server-side authorized download:
  - Streams from the storage adapter (never buffers the whole file in
    memory — large PDFs and images stream cleanly).
  - Sets `Content-Type` to the file media type,
    `Content-Disposition: attachment; filename="…"`,
    `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.
  - Audit-logged **before** streaming so a stream failure does not skip
    the audit row.

### Transfer-document wiring (`/transfers/{id}/documents`, `/transfer-documents/{id}/review`)
Implements `WORKFLOWS.md §7` (document review, approval, and rejection).
- `POST /transfers/{id}/documents` — attach an existing uploaded
  document to a transfer (creates a `TransferDocument` row). Idempotent:
  re-attaching the same `(transferId, documentId)` returns the existing
  row. Citizens can only attach documents they uploaded; officers may
  attach any document on a citizen's behalf.
- `GET /transfers/{id}/documents` — list documents attached to a
  transfer, with their verification status. Citizens limited to
  transfers where they are a party.
- `POST /transfer-documents/{id}/review` — officer review, sets
  `verificationStatus` to `Verified` / `Rejected` / `AdditionalRequested`
  with a documented reason. Stores `verifiedById` and `verifiedAt`.
  Audited. Optimistic concurrency via `expectedVersion`.

  Per `SECURITY_DESIGN.md`: "Transfer decisions cannot bypass documented
  validation steps. Review decisions and accessed sensitive records are
  audited." `transfersService.approveTransfer` already requires all
  transfer documents to be `Verified` before approval (implemented in M4).

### Schema additions
`AuditAction` enum extended with: `DocumentUpload`, `DocumentReview`,
`DocumentDownload`.

### Env / config
- `STORAGE_ROOT` env var added to `.env.example` — controls where the
  mock filesystem adapter stores uploaded files.
- `apps/api/src/app.js` mounts 2 new routers under `/api/v1`: `/documents`
  and `/transfer-documents`. The transfers router now also handles
  `/:id/documents` (attach + list).

### OpenAPI
Spec at `/api-docs` now documents **55 endpoints** (up from 50 in M5).

## Security controls reaffirmed

| SECURITY_DESIGN.md rule | Where |
|---|---|
| Upload through authenticated, authorized endpoints only | `documentsRouter.use(requireAuth)` |
| Validate file type by content inspection | `documentsService.detectType` magic-byte check |
| Validate extension | `EXTENSION_ALLOWLIST` + `EXTENSION_BLOCKLIST` |
| Validate MIME type | `MIME_ALLOWLIST` + multer fileFilter pre-check |
| Validate size limit | multer 10 MB + service re-check after buffer load |
| Validate checksum | SHA-256 computed in `persistFile` |
| Reject executable/unsupported content | `EXTENSION_BLOCKLIST` blocks `.exe/.dll/.so/.sh/.js/.py/.zip/…` |
| Private external storage, no public paths | `storageAdapter` writes to private root; downloads gated by `/documents/{id}/content` |
| Authorize every download server-side | `streamDocumentContent` ownership check + audit |
| Treat IDs, deeds, sale agreements as sensitive | `classification = 'restricted'` by default; `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` |
| Audit document review | `reviewTransferDocument` writes `DocumentReview` audit entry |
| Optimistic concurrency on editable records | `reviewTransferDocument` takes `expectedVersion` |

## What is still intentionally NOT in this milestone

- Real malware scanning/quarantine (deployment decision per `SECURITY_DESIGN.md`)
- Real S3/NAS storage adapter (mock local FS adapter in place — swappable)
- Public search (`GET /public/parcels/search`) — fields pending business/privacy policy per `PROJECT_DECISIONS.md`
- CIS adapter (production contract pending)
- Frontend integration (citizen PWA + staff portal remain M2 placeholders)
- PostGIS spatial indexes (still `Json` for boundaries)
- Multi-instance distributed lock for the reminder scheduler
- Real SMS/email/certificate-signing authority providers (still mocks)
