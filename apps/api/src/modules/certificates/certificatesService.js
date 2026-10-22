// Certificates module — implements FR-32 (PDF certificates with digital
// signature + watermark + QR code) and WORKFLOWS.md §8 (certificate
// generation workflow). Per PROJECT_DECISIONS.md, the legal signing
// authority, key management, QR payload format, and revocation/reissue
// rules are unspecified — the prototype produces a self-contained PDF
// with a QR code that links back to the API verification endpoint.
//
// Certificates are issued atomically inside transfers.approveTransfer
// (already implemented in M4) and inside parcels.createParcel as the
// initial certificate for a newly registered parcel. This module exposes
// read + download endpoints only; issuance is a side-effect of those
// workflows to preserve ACID guarantees.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, RoleCode } from '@prisma/client';

export async function getCertificate({ id, request }) {
  const cert = await db.certificate.findUnique({
    where: { id },
    include: { parcel: true, owner: true, transfer: true }
  });
  if (!cert) {
    throw new AppError(404, 'NOT_FOUND', 'Certificate not found.');
  }
  // SECURITY_DESIGN.md: server-side ownership check.
  if (request.role?.code === RoleCode.Citizen) {
    const ownerId = request.user.ownerProfile?.id;
    if (cert.ownerId !== ownerId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only access your own certificates.');
    }
  }
  return certificateDto(cert, { withRelations: true });
}

// Returns the generated PDF as a Buffer; the route handler streams it to the
// client with the right Content-Type and Content-Disposition headers.
export async function downloadCertificatePdf({ id, request }) {
  const cert = await db.certificate.findUnique({
    where: { id },
    include: { parcel: true, owner: true, transfer: true }
  });
  if (!cert) {
    throw new AppError(404, 'NOT_FOUND', 'Certificate not found.');
  }
  if (request.role?.code === RoleCode.Citizen) {
    const ownerId = request.user.ownerProfile?.id;
    if (cert.ownerId !== ownerId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only download your own certificates.');
    }
  }
  if (cert.status !== 'Active') {
    throw new AppError(409, 'CERT_NOT_ACTIVE', `Certificate status is ${cert.status}; cannot download.`);
  }

  // Audit the download before generating the PDF so a PDF-generation failure
  // does not skip the audit row.
  await writeAudit(request, AuditAction.CertificateDownload, {
    entityType: 'Certificate',
    entityId: id,
    newSnapshot: { certificateNumber: cert.certificateNumber, downloadedAt: new Date().toISOString() }
  });

  const pdf = await renderCertificatePdf(cert);
  return { pdf, filename: `certificate-${cert.certificateNumber}.pdf` };
}

// ---------------------------------------------------------------------------
// PDF rendering — pdfkit + qrcode. The PDF includes:
//   - "DIRE DAWA LAND ADMINISTRATION" header
//   - Certificate number + issue date + status
//   - Parcel number, location, declared size, land use
//   - Current owner name + national ID
//   - QR code linking to /api/v1/certificates/{id} (verification endpoint)
//   - Watermark text "PROTOTYPE — NOT LEGALLY BINDING" diagonally across the page
// ---------------------------------------------------------------------------

async function renderCertificatePdf(cert) {
  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Watermark — diagonal text on every page (pdfkit makes this easy with the
  // page pivot). PROJECT_DECISIONS.md: signature/authority is unspecified, so
  // the prototype watermark is explicit about not being legally binding.
  drawWatermark(doc);

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('DIRE DAWA LAND ADMINISTRATION', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).font('Helvetica').text('Land Ownership Certificate', { align: 'center' });
  doc.moveDown(1);

  // Certificate metadata
  doc.fontSize(10).font('Helvetica-Bold').text('Certificate Number: ', { continued: true });
  doc.font('Helvetica').text(cert.certificateNumber);
  doc.font('Helvetica-Bold').text('Status: ', { continued: true });
  doc.font('Helvetica').text(cert.status);
  doc.font('Helvetica-Bold').text('Issued At: ', { continued: true });
  doc.font('Helvetica').text(cert.issuedAt.toISOString());
  doc.moveDown(1);

  // Parcel + owner block
  doc.fontSize(13).font('Helvetica-Bold').text('Parcel Information');
  doc.fontSize(10).font('Helvetica');
  if (cert.parcel) {
    doc.text(`Parcel Number: ${cert.parcel.parcelNumber}`);
    doc.text(`Location: ${cert.parcel.location}, ${cert.parcel.kebele}, ${cert.parcel.subCity}`);
    doc.text(`Declared Size: ${cert.parcel.declaredSize} ${cert.parcel.sizeUnit}`);
    doc.text(`Land Use Type: ${cert.parcel.landUseType}`);
  }
  doc.moveDown(1);

  doc.fontSize(13).font('Helvetica-Bold').text('Registered Owner');
  doc.fontSize(10).font('Helvetica');
  if (cert.owner) {
    doc.text(`Name: ${cert.owner.fullName}`);
    doc.text(`National ID: ${cert.owner.nationalId}`);
    doc.text(`Address: ${cert.owner.physicalAddress}`);
  }
  doc.moveDown(1);

  if (cert.transferId) {
    doc.font('Helvetica-Bold').text('Origin: ', { continued: true });
    doc.font('Helvetica').text(`Approved ownership transfer ${cert.transferId}`);
    doc.moveDown(1);
  }

  // QR code (PNG buffer)
  const verificationUrl = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000'}/api/v1/certificates/${cert.id}`;
  const qrPng = await QRCode.toBuffer(verificationUrl, { width: 220, margin: 1 });
  doc.image(qrPng, { width: 150, align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(8).font('Helvetica-Oblique').text('Scan to verify this certificate at the DLPMS verification endpoint.', { align: 'center' });

  // Footer
  doc.moveDown(2);
  doc.fontSize(8).font('Helvetica-Oblique').fillColor('#888').text(
    'This certificate was produced by the DLPMS prototype. Signature authority, key management, and revocation policy are pending — treat this document as PROTOTYPE ONLY and NOT legally binding.',
    { align: 'center' }
  );

  doc.end();
  return done;
}

function drawWatermark(doc) {
  // Save state, rotate 45°, draw faint diagonal text across the page center,
  // restore. Done on every page via the pageAdded event for multi-page certs.
  const draw = (page) => {
    const { width, height } = page.size;
    page.save();
    page.translate(width / 2, height / 2);
    page.rotate(45);
    page.fillColor('#e5e5e5');
    page.fontSize(60).font('Helvetica-Bold').opacity(0.4);
    page.text('PROTOTYPE — NOT LEGALLY BINDING', { width: 700, align: 'center' });
    page.restore();
  };
  draw(doc.page);
  doc.on('pageAdded', () => draw(doc.page));
}

function certificateDto(cert, { withRelations = false } = {}) {
  return {
    id: cert.id,
    parcelId: cert.parcelId,
    ownerId: cert.ownerId,
    transferId: cert.transferId,
    certificateNumber: cert.certificateNumber,
    status: cert.status,
    issuedAt: cert.issuedAt,
    revokedAt: cert.revokedAt,
    qrPayload: cert.qrPayload,
    version: cert.version,
    createdAt: cert.createdAt,
    updatedAt: cert.updatedAt,
    ...(withRelations
      ? {
          parcel: cert.parcel ? { id: cert.parcel.id, parcelNumber: cert.parcel.parcelNumber } : null,
          owner: cert.owner ? { id: cert.owner.id, fullName: cert.owner.fullName, nationalId: cert.owner.nationalId } : null,
          transfer: cert.transfer ? { id: cert.transfer.id, trackingId: cert.transfer.trackingId } : null
        }
      : {})
  };
}
