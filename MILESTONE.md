# DLPMS Milestone 8 — Frontend integration

Builds on M7 (the API is fully implemented across 55 endpoints and 7
sub-systems) by wiring the two React frontends to the API. Both apps
were M2 placeholders (a Home page + a 404 page); they are now real
single-page applications with auth, routing, role-aware navigation, and
real pages that call the API.

Per `ARCHITECTURE.md` Presentation layer:
- Citizen React PWA: citizen records, transfer submission, tax/payment
  experience, appointments, certificates, profile, language selection.
- Staff React web portal: Land Officer, Tax Official, GIS Officer, and
  Admin workspaces.

## What was added

### Citizen PWA (`apps/citizen-pwa`)
Now a real SPA with **10 pages** wired to the API:

| Page | API endpoints called |
|---|---|
| `/login` | `POST /auth/login` |
| `/register` | `POST /auth/register` |
| `/` (Dashboard) | `GET /parcels?pageSize=5`, `GET /transfers?pageSize=5`, `GET /notifications/unread` |
| `/parcels` | `GET /parcels` |
| `/parcels/:id` | `GET /parcels/{id}`, `GET /parcels/{id}/ownership-history`, `GET /parcels/{id}/tax-records` |
| `/transfers` | `GET /transfers` |
| `/transfers/new` | `GET /parcels` (for the parcel picker), `POST /transfers` |
| `/transfers/:id` | `GET /transfers/{id}`, `GET /transfers/{id}/documents`, `POST /transfers/{id}/submit`, `POST /transfers/{id}/cancel` |
| `/appointments` | `GET /appointments`, `POST /appointments` |
| `/certificates` | `GET /certificates/{id}`, `POST /certificates/{id}/download` (blob download) |
| `/notifications` | `GET /notifications?pageSize=50`, `PATCH /notifications/{id}/read` |

Infrastructure:
- `lib/apiClient.js` — fetch-based, JWT access + refresh token storage in
  localStorage, **one-shot auto-refresh on 401** with retry of the
  original request, multipart support, error normalization.
- `lib/format.js` — shared formatters (date, money, transfer status,
  boundary status).
- `contexts/AuthContext.jsx` — `<AuthProvider>` + `useAuth()` hook;
  refreshes the user from `/me` on mount.
- `components/ui.jsx` — Button (5 variants), Input, Card, Badge, Spinner,
  EmptyState, ErrorBanner, Field.
- `components/Layout.jsx` — top bar with logout + nav; mobile-responsive.
- `components/RouteGuards.jsx` — `<ProtectedRoute>` and
  `<PublicOnlyRoute>` (redirects to `/` if already logged in).

The dashboard shows a 4-card stats overview (parcels, transfers, unread
notifications, certificates) plus recent parcels and transfers lists.
The transfer detail page renders a visual state-machine stepper for the
linear path (`Draft → Submitted → TaxVerified → UnderReview → Approved`)
and surfaces the appropriate contextual message for `TaxHold`,
`DocumentsRequested`, `Rejected`, `Approved` states.

### Staff portal (`apps/staff-portal`)
Real SPA with **7 role-aware pages**:

| Page | API endpoints called | Roles |
|---|---|---|
| `/login` | `POST /auth/login` | All |
| `/` (Dashboard) | none — role-aware card links | All |
| `/parcels` | `GET /parcels?pageSize=50`, `POST /parcels` | LandOfficer, SystemAdmin |
| `/transfers` | `GET /transfers?pageSize=50` | LandOfficer, SystemAdmin |
| `/transfers/:id` | `GET /transfers/{id}`, `GET /transfers/{id}/documents`, `POST /transfers/{id}/{request-documents,approve,reject}` | LandOfficer, SystemAdmin |
| `/tax` | `GET /tax/dashboard`, `GET /tax/arrears` | TaxOfficial, SystemAdmin |
| `/audit-logs` | `GET /admin/audit-logs`, `GET /admin/audit-logs/export` (blob CSV download) | SystemAdmin |
| `/users` | `GET /admin/users`, `GET /admin/roles`, `PATCH /admin/users/{id}/role`, `POST /admin/users/{id}/deactivate` | SystemAdmin |

Infrastructure mirrors the citizen PWA (separate localStorage keys so a
citizen token never bleeds into a staff session). The Layout component
filters NAV links by `user.role` — a TaxOfficial sees only the Tax card
+ dashboard; a LandOfficer sees Parcels + Transfers + Appointments; a
SystemAdmin sees everything.

### Schema / config
- No schema changes (M8 is purely frontend).
- Both apps gain the `VITE_API_BASE_URL` env var (defaults to
  `http://localhost:4000/api/v1`) — set this when deploying behind a
  proxy.
- `eslint.config.js` extended with browser globals (`localStorage`,
  `fetch`, `FormData`, `URL`, `URLSearchParams`, `Blob`, `FileReader`,
  `window`).

## Verification
- `npm run lint`: clean (both apps).
- `npm run build`: green — both Vite apps build (~210 KB / ~205 KB
  gzipped bundles; up from 164 KB placeholders in M2-M7 because they
  now include React Router, lucide icons, and ~10 page modules each).
- Live boot: API + both Vite dev servers running detached via
  `setsid`. Vite serves the new modules correctly:
  - `/src/main.jsx` returns the JSX-Runtime-instrumented module
  - `/src/App.jsx` returns the route tree with HMR
  - `/src/pages/LoginPage.jsx`, `DashboardPage.jsx`, `UsersPage.jsx`,
    etc. all return their transformed modules (Vite hot module reload
    is active)
- API health check returns 200; OpenAPI spec unchanged at 55 endpoints.

## What is still intentionally NOT in this milestone

- Real provider adapters (telebirr, SMS, email, certificate signing)
  remain mocks
- PostGIS swap (boundary still `Json`) — M7
- Public search (`GET /public/parcels/search`) — fields pending
  business/privacy policy per `PROJECT_DECISIONS.md`
- CIS adapter (production contract pending)
- Real malware scanning/quarantine (deployment decision)
- Multi-instance distributed lock for the reminder scheduler
- Document upload UI (the API supports multipart upload but the citizen
  PWA does not yet expose an upload form — the `/documents` POST is
  available for direct API use)
- GIS boundary map UI (Leaflet) — the API supports boundary upload +
  verify, but the staff portal does not yet render an interactive map
- Amharic localization (the schema supports `preferredLanguage = 'am'`
  but the UI is English-only for now)
