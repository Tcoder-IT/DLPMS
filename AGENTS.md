# DLPMS Contribution Guidance

- Treat `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `API_DESIGN.md`, `SECURITY_DESIGN.md`, `WORKFLOWS.md`, and `PROJECT_DECISIONS.md` as the project baseline.
- Keep DLPMS a modular monolith. Do not introduce microservices unless the project decision is explicitly revised.
- Do not hard-code secrets, provider credentials, tax rates, legal rules, or undocumented public-search fields.
- External CIS, payment, SMS, email, and storage integrations must be adapter-based and begin with mock/sandbox implementations.
- Apply authorization, validation, error handling, auditability, and optimistic-concurrency requirements before adding a business workflow.
- Do not make ownership documents publicly accessible.
- Keep API contracts documented in OpenAPI as endpoints are added.
- Make focused changes; preserve unrelated user work.
