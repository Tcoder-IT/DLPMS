# DLPMS Workflow Blueprint

## 1. Citizen registration and authentication

1. Citizen submits personal details and phone number.
2. System validates input and creates/updates the pending account according to the identity module design.
3. OTP is sent through the notification adapter (mock/sandbox initially).
4. Citizen verifies OTP, then can log in with phone/email, password, and OTP verification as required.
5. Authentication and security-relevant events are audited.

Identity-verification policy beyond uploaded documents is not specified.

## 2. Land registration

1. Land Officer opens a new registration after applicant documents have been submitted physically or digitally.
2. Officer enters parcel location, size, and land-use type, plus owner name, national ID, address, and phone.
3. Officer links/uploads a GIS boundary when available and attaches deed/supporting documents.
4. System checks duplicate parcel ID and, where geometry is supplied, boundary overlap.
5. Missing mandatory fields block submission. An overlap is surfaced to GIS Officer for resolution.
6. System creates parcel, owner/ownership, registry history, document metadata, and audit records atomically.
7. System generates the documented digital certificate.

## 3. Land transfer

1. Citizen selects an owned parcel, enters buyer information and sale price, and uploads sale agreement/supporting documents.
2. System verifies the seller is current owner and creates a tracked `Draft` request.
3. On submission, the request enters `Submitted` and an automated tax check occurs.
4. No outstanding dues: `TaxVerified`, then `UnderReview`; dues: `TaxHold` and citizen is notified to pay.
5. Officer reviews ownership, buyer identity/eligibility, tax clearance, and document completeness/authenticity.
6. Officer requests documents (`DocumentsRequested`), rejects with reasons (`Rejected`), or approves (`Approved`).
7. Approval atomically updates ownership and history, produces certificate, sends notification, and writes an audit entry.
8. Citizen may cancel before final approval. Each transition is auditable.

## 4. Tax calculation, payment, and tax hold

1. Tax Official/system calculates tax from area, location, and property type using administrator-configured rates/fees.
2. A citizen may initiate a mock/sandbox online payment or a Tax Official records office-counter payment.
3. Payment adapter creates a transaction reference; a provider callback is signature-validated before completion.
4. System validates amount against outstanding due, updates payment and annual tax record, and generates receipt.
5. Full payment removes a tax hold. Partial payment keeps it. Overpayment becomes documented credit balance.
6. Failed/timeout/rejected callbacks do not mark tax as paid. Refund is an administrator action only.

## 5. GIS boundary verification

1. GIS Officer finds a parcel and uploads Shapefile/GeoJSON or draws/edits a polygon.
2. System validates and converts input to WGS84/SRID 4326 polygon geometry.
3. PostGIS checks intersections/overlaps with neighboring parcels; geometry may also support gaps, point lookup, and calculated area.
4. Conflict is highlighted and resolved with a Land Officer before proceeding.
5. If no overlap remains, system stores geometry and marks the boundary verified; all edits/verification are audited.

## 6. Appointment workflow

1. Citizen selects service type, officer/date range, a real-time available slot, and purpose/details.
2. System rechecks availability to prevent double booking, then creates appointment.
3. Notification adapter sends confirmation through mock/sandbox SMS/email initially and schedules a 24-hour reminder.
4. Citizen may request reschedule/cancellation. The cancellation time window is configurable because the PDF does not define it.
5. Staff view schedules; system retains appointment/no-show history for reporting.

## 7. Document review, approval, and rejection

1. Citizen or officer uploads an authorized document; system validates and privately stores it.
2. Officer reviews authenticity/completeness where the workflow requires it.
3. The officer records verification result, rejection reason, or request for additional documents.
4. Transfer decisions cannot bypass documented validation steps. Review decisions and accessed sensitive records are audited.

## 8. Certificate generation

1. Successful land registration or approved transfer triggers certificate generation.
2. Certificate is PDF, digitally signed/watermarked, and includes QR-code support as documented.
3. System stores certificate metadata/reference privately and makes it available only to authorized users.
4. Exact legal signature mechanism, QR payload, and revocation policy are unresolved.

