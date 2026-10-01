# DLPMS Requirements Baseline

Primary source: `docs/DIGITAL LAND AND PROPERTY MANAGEMENT FULL DOCUMENTATION (1).pdf`, especially Chapters 2–4. This document records requirements stated in that source; unspecified matters are deferred to `PROJECT_DECISIONS.md`.

## Scope and objectives

DLPMS is a pilot Digital Land and Property Management System for selected urban kebeles in Dire Dawa. It extends the existing DDLA Cadastral Information System (CIS), rather than replacing it, with citizen-facing digital services, payment support, comprehensive audit logging, appointment scheduling, and improved administrative workflows. Stated objectives are a secure central database, GIS mapping and boundary verification, web/mobile interfaces, role-based access, audit logging, and usability/performance/security testing.

The documented prototype does **not** include digitizing all historical paper records. Real payment integration is described as simulated in the project scope; live production integrations are therefore out of scope for the initial build.

## User roles

| Role | Documented responsibilities |
|---|---|
| Citizen | Register and authenticate; view permitted land records; submit transfers and documents; track applications; pay; book appointments; download receipts/certificates; use public search as permitted. |
| Land Officer | Process land registrations; search records; verify documents; review, approve, reject, or request documents for transfers; produce registration/transfer reports; view appointments. |
| Tax Official | Calculate tax; record online/offline payment; view arrears; apply tax hold; issue receipts; view collection dashboards and compliance reports. |
| GIS Officer | Upload, create, edit, and verify parcel boundaries; investigate overlaps/gaps. |
| System Administrator | Manage users/roles; configure parameters; view/export audit logs; backup/restore. |

## Functional requirements

### Citizen requirements (FR-01–FR-10)

1. Register with personal details and phone number.
2. Log in using phone number or email, password, and OTP verification.
3. View land/property records associated with the account.
4. Apply for ownership transfer with required documents.
5. Upload supporting ID, photos, and forms in PDF or image formats.
6. Track submitted application status in real time.
7. Download digitally signed land ownership certificates in PDF format.
8. Book appointments for in-person verification.
9. Make property-tax payments through telebirr integration.
10. Search public land records by parcel ID, owner name, or location.

### Land officer requirements (FR-11–FR-16)

11. Process new land-registration applications.
12. Verify uploaded documents for authenticity and completeness.
13. Approve transfers after validation.
14. Reject transfers with documented reasons.
15. Generate land-registration and transfer reports.
16. Search/retrieve land records from CIS.

### Tax requirements (FR-17–FR-21)

17. Calculate property tax based on land area, location, and property type.
18. Record manual/offline office-counter payments.
19. Provide tax-collection and outstanding-dues summaries.
20. Generate official receipts for online and offline payments.
21. Generate tax-compliance reports by period and sub-city.

### GIS requirements (FR-22–FR-24)

22. Upload and update parcel boundaries from survey measurements.
23. Verify boundaries against GIS cadastral maps.
24. View and interact with parcel maps in the web GIS interface.

### Administration and platform requirements (FR-25–FR-36)

25. Create, assign roles to, and deactivate user accounts.
26. View and filter comprehensive audit logs.
27. Configure tax rates, fees, and notification templates.
28. Perform database backup and restore.
29. Authenticate users via JWT with RBAC.
30. Send SMS reminders and status notifications.
31. Send email for application status changes.
32. Generate digitally signed, watermarked PDF certificates.
33. Validate payment-webhook signatures.
34. Log all CRUD operations with timestamp, user, and action details.
35. Detect concurrent edits using optimistic locking/conflict detection.
36. Send automated appointment reminders 24 hours before the appointment.

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | 95th-percentile response time below 3 seconds under normal load for 500 concurrent users. |
| NFR-02 | TLS 1.2+, JWT, bcrypt cost factor 12, and OWASP Top 10-oriented security controls. |
| NFR-03 | Support 500+ concurrent users with less than 10% response-time degradation. |
| NFR-04 | 99.5% availability target. |
| NFR-05 | Responsive citizen portal for current Chrome, Firefox, and Safari on desktop/tablet/mobile. |
| NFR-06 | ACID-compliant PostgreSQL transactions; no partial updates on failed operations. |
| NFR-07 | Immutable/tamper-evident audit trail for all CRUD operations. |
| NFR-08 | Daily backups, 30-day retention, and monthly restore test. |
| NFR-09 | Offline-capable PWA; Lighthouse PWA score target of 90+. |
| NFR-10 | OpenAPI/Swagger 3.0 REST API documentation at `/api-docs`. |
| NFR-11 | Amharic and English UI, messages, and notifications with selectable language. |
| NFR-12 | WCAG 2.1 Level AA accessibility. |
| NFR-13 | Reports and audit logs exportable as CSV and PDF. |

## Core workflows

- Citizen registration, login, OTP verification, and profile maintenance.
- Land registration by officer: capture parcel/owner data, attach records, check duplicate ID and overlap, create records, issue certificate.
- Land transfer: draft, submission, tax check, officer review, document-request loop, approval/rejection/cancellation, ownership update, certificate and notification.
- Tax calculation/payment: calculate due, accept online or office payment, validate amount, update tax record, manage hold, issue receipt.
- GIS boundary upload/draw/edit, overlap/gap check, verification.
- Appointment slot management, booking, rescheduling/cancellation, confirmation and 24-hour reminder.
- Document review: officer verifies completeness/authenticity and approves, rejects with reasons, or requests additional documents.
- Administrative audit review/export, user/role administration, system settings, backup/restore.

## Business rules and constraints

- A transfer applicant must be the current registered owner.
- A transfer begins as `Draft`; on submission it is tax-checked.
- Outstanding dues cause `TaxHold`; the transfer cannot proceed until full payment and re-check.
- Transfer states documented: `Draft`, `Submitted`, `TaxVerified`, `TaxHold`, `UnderReview`, `DocumentsRequested`, `Approved`, `Rejected`; cancellation is allowed before final approval.
- Officers must document rejection reasons. Missing/incomplete documents may lead to `DocumentsRequested`.
- Approval requires ownership, buyer identity/eligibility, document, and tax-clearance validation, then updates ownership and creates certificate, notification, and audit record.
- Partial tax payment keeps the hold active. Overpayment is recorded as a credit balance.
- Duplicate parcel ID and overlapping parcel geometry block the relevant registration/verification process.
- Boundary verification stores geometry only after no overlap is detected; conflicts require resolution with a Land Officer.
- A payment callback must be signature-validated; a missing callback after 15 minutes is failed. Only an administrator may refund a completed payment.
- Appointment availability is checked in real time to prevent double booking. The permitted cancellation window is not specified.
- Public search exists, but public fields and privacy policy are not specified.

## Reporting requirements

- Daily, weekly, and monthly land-registration and transfer reports.
- Tax collection summaries and outstanding-dues dashboard.
- Tax-compliance reports filtered by period and sub-city.
- Operational statistics, including appointment history/no-show statistics.
- Filterable audit-log views/exports by date, user, action type, and record ID.
- Export to PDF and CSV.

## Document requirements

Inputs: sale agreement; seller/buyer ID copies; photos/forms when required; tax-clearance certificate; deed and land-registration supporting documents; GIS Shapefile/GeoJSON boundary data.

Generated outputs: digitally signed/watermarked PDF land certificate with QR code; PDF tax receipt/payment receipt; appointment confirmation. Files are externally stored; database records retain metadata and storage path/reference.

