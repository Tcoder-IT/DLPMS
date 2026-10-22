# DLPMS Milestone 9 — Document upload UI + GIS Leaflet map UI

Fills the two biggest UX gaps from M8:

1. **Citizen PWA** — citizens could not upload documents through the UI.
   This broke the end-to-end transfer workflow: `transfersService.approveTransfer`
   (M4) requires all attached documents to have `verificationStatus = 'Verified'`,
   which required an officer to set, but citizens had no way to upload + attach
   the documents in the first place. M9 adds a Documents page with multipart
   upload + an inline "attach to transfer" form on the transfer detail page.

2. **Staff portal** — the GIS sub-system (M4) had `/gis/parcels`,
   `/gis/parcels/{id}/boundary`, `/gis/parcels/{id}/verify`,
   `/gis/boundaries/import`, and `/gis/overlaps` endpoints, but no UI.
   M9 adds a real Leaflet map showing all parcel boundaries as polygons,
   with click-to-draw, GeoJSON file upload, and a verify button that
   highlights overlaps.

## What was added

### Backend — new `GET /documents` endpoint
The M6 documents module had `POST /documents`, `GET /documents/{id}`,
`GET /documents/{id}/content` but **no list endpoint**. M9 adds:

- `GET /documents` — paginated list. **Citizens see only their own uploads**
  (per `SECURITY_DESIGN.md` server-side ownership). Staff see all. Each
  row includes an `attachedTo` array linking to any transfers the
  document is attached to (with `trackingId`, `transferStatus`,
  `documentType`, `verificationStatus`).

The endpoint is documented in the OpenAPI spec — `/api-docs` now
exposes **56 endpoints** (up from 55 in M8).

### Citizen PWA — Documents page
`apps/citizen-pwa/src/pages/DocumentsPage.jsx`:
- Multipart upload form (`<input type="file" accept=".pdf,.png,.jpg,.jpeg">`)
  that posts to `/documents` via `FormData`. Pre-flight size check
  (10 MB) before upload. After upload, shows the new document ID so the
  citizen can copy it for use on the transfer detail page.
- List of the citizen's uploaded documents with `originalFilename`,
  `mediaType`, `byteSize`, `uploadedAt`, and `attachedTo` chain showing
  which transfers each document is attached to and the current
  verification status (with link to the transfer).
- Defensive UX note explaining the magic-byte + extension + MIME
  validation rules.

### Citizen PWA — Transfer detail page attach form
Extended `apps/citizen-pwa/src/pages/TransferDetailPage.jsx`:
- Loads the citizen's uploaded documents in parallel with the transfer
  + attached-documents data.
- Inline "Attach a document" form (dropdown of the citizen's uploads +
  document-type dropdown with the seven canonical types: `sale_agreement`,
  `seller_id`, `buyer_id`, `tax_clearance`, `deed`, `photo`, `other`).
- Calls `POST /transfers/{id}/documents` (M6).
- Form is shown only when the transfer is in any pre-approval state —
  once `Approved` / `Rejected` / `Cancelled`, no further attachments
  are accepted (the API would reject them with `INVALID_TRANSITION`).

### Staff portal — GIS page
`apps/staff-portal/src/pages/GisPage.jsx`:
- Left column: paginated list of parcels with `parcelNumber`,
  `subCity`/`kebele`, and a boundary-status badge (`Pending`/`Verified`/
  `OverlapConflict`/`Rejected`). Vertex count shown for parcels with
  a stored boundary.
- Right column: a 400px Leaflet `MapContainer` (OpenStreetMap tiles)
  centered on Dire Dawa `[9.5915, 41.8629]`. Renders **every** parcel's
  boundary as a `<Polygon>`:
  - Selected parcel: bold blue (`#1d4ed8`), 3px weight, 0.15 fill.
  - Overlapping parcels (post-verify): red (`#dc2626`), 0.25 fill.
  - Other parcels: grey (`#475569`), 1px weight, 0.08 fill.
- `Recenter` helper uses `useMap()` + `L.latLngBounds().fitBounds()` to
  frame the selected parcel's vertices.
- **Draw-on-map mode**: a `ClickHandler` (uses `useMapEvents({click})`)
  captures clicks and adds them to `drawPoints`; the in-progress polygon
  is rendered with a dashed green stroke. Save button converts the
  `[lat,lng]` points to GeoJSON Polygon `[lng,lat]` coordinates, auto-
  closes the ring if needed, and PUTs to `/gis/parcels/{id}/boundary`.
- **GeoJSON file upload**: file input accepts `.json`/`.geojson`,
  populates a textarea (paste-able), and the upload button POSTs to
  `/gis/parcels/{id}/boundary` with `{ geometry, expectedVersion }`.
- **Verify button**: POSTs to `/gis/parcels/{id}/verify`, displays the
  result with green "Verified" or red "OverlapConflict" + the list of
  conflicting parcels.

The Leaflet CSS is loaded from the unpkg CDN with a Subresource
Integrity hash in `apps/staff-portal/index.html`.

### Config
- New dependencies in `apps/staff-portal/package.json`:
  `leaflet@^1.9.4`, `react-leaflet@^4.2.1` (v4 pinned because v5
  requires React 19; the project uses React 18.3.1).
- No schema changes.
- No new env vars.

## Verification
- `npm run lint`: clean (both apps).
- `npm run build`: green. Citizen PWA bundle grew to 222 KB / 67 KB
  gzipped (was 213 / 65 in M8) because of the new Documents page +
  attach form. Staff portal grew to 370 KB / 112 KB gzipped (was 206 /
  63) because of Leaflet + react-leaflet + the GIS page (~150 KB of
  new code including the map renderer).
- Live boot: API + both Vite dev servers running detached via `setsid`.
  All three return 200:
  - `http://localhost:4000/api/v1/health` → 200
  - `http://localhost:5173/src/pages/DocumentsPage.jsx` → 200 (HMR active)
  - `http://localhost:5174/src/pages/GisPage.jsx` → 200 (HMR active)
  - `http://localhost:5174/node_modules/.vite/deps/leaflet.js` → 200
    (Vite pre-bundled Leaflet correctly)
- New `GET /documents` endpoint returns 401 cleanly through the auth
  wall without a token (proves wiring without needing a Postgres
  backend).

## What is still intentionally NOT in this milestone

- Real provider adapters (telebirr, SMS, email, certificate signing) —
  still mocks
- PostGIS swap (boundary still stored as `Json`) — M7 still deferred
- Public search (`GET /public/parcels/search`) — fields pending
  business/privacy policy per `PROJECT_DECISIONS.md`
- CIS adapter (production contract pending)
- Real malware scanning/quarantine (deployment decision)
- Multi-instance distributed lock for the reminder scheduler
- Amharic localization (the schema supports `preferredLanguage = 'am'`
  but the UI is English-only for now)
- Shapefile import (only GeoJSON is supported in the UI; the API
  accepts any GeoJSON Polygon regardless of source)
- Map click-to-edit existing polygon vertices (only draw-new is
  supported; editing an existing polygon requires re-uploading)
