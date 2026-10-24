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
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit, auditView } from '../../middleware/auditMiddleware.js';
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
  // NFR-07: audit the view.
  await auditView(request, 'Certificate', id, { certificateNumber: cert.certificateNumber, status: cert.status });
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

// ---------------------------------------------------------------------------
// Certificate lifecycle: revocation + reissue
//
// Per the certificate state model (PDF §3.3.4 class diagram + the
// CertificateStatus enum): Active → Revoked (admin) or Active → Replaced
// (when a reissue creates a new Active cert for the same parcel+owner).
//
// Revocation: only SystemAdmin per SECURITY_DESIGN.md "elevated actions are
// audited" — refund, certificate revocation, and other privileged admin
// operations are restricted to SystemAdmin.
//
// Reissue: LandOfficer or SystemAdmin. Creates a new Active certificate with
// a fresh certificateNumber + qrPayload; the previous cert is atomically
// marked Replaced in the same transaction.
// ---------------------------------------------------------------------------

const reasonSchema = z.object({
  reason: z.string().min(1).max(2000)
});

export async function revokeCertificate({ id, input, request }) {
  if (request.role?.code !== RoleCode.SystemAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Certificate revocation is restricted to System Administrators.');
  }
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Reason is required.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const cert = await db.certificate.findUnique({ where: { id } });
  if (!cert) {
    throw new AppError(404, 'NOT_FOUND', 'Certificate not found.');
  }
  if (cert.status !== 'Active') {
    throw new AppError(409, 'NOT_ACTIVE', `Certificate is in ${cert.status} state; only Active certificates can be revoked.`);
  }
  const updated = await db.certificate.update({
    where: { id },
    data: {
      status: 'Revoked',
      revokedAt: new Date(),
      version: { increment: 1 }
    },
    include: { parcel: true, owner: true }
  });
  await writeAudit(request, AuditAction.CertificateRevoke, {
    entityType: 'Certificate',
    entityId: id,
    oldSnapshot: { status: 'Active', certificateNumber: cert.certificateNumber },
    newSnapshot: { status: 'Revoked', revokedAt: updated.revokedAt.toISOString(), reason: parsed.data.reason }
  });
  return certificateDto(updated, { withRelations: true });
}

export async function reissueCertificate({ id, input, request }) {
  if (request.role?.code !== RoleCode.LandOfficer && request.role?.code !== RoleCode.SystemAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Certificate reissue is restricted to Land Officers and System Administrators.');
  }
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Reason is required.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const oldCert = await db.certificate.findUnique({
    where: { id },
    include: { parcel: true, owner: true }
  });
  if (!oldCert) {
    throw new AppError(404, 'NOT_FOUND', 'Certificate not found.');
  }
  if (oldCert.status !== 'Active') {
    throw new AppError(409, 'NOT_ACTIVE', `Certificate is in ${oldCert.status} state; only Active certificates can be reissued.`);
  }

  // ACID transaction (NFR-06): mark old cert as Replaced, create new Active
  // cert with a fresh certificateNumber + qrPayload for the same parcel + owner.
  const newCertificateNumber = `CERT-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const newCert = await db.$transaction(async (tx) => {
    // Mark the old cert as Replaced.
    await tx.certificate.update({
      where: { id },
      data: {
        status: 'Replaced',
        revokedAt: new Date(),
        version: { increment: 1 }
      }
    });
    // Create the replacement Active certificate.
    return tx.certificate.create({
      data: {
        parcelId: oldCert.parcelId,
        ownerId: oldCert.ownerId,
        transferId: oldCert.transferId,
        certificateNumber: newCertificateNumber,
        status: 'Active',
        qrPayload: `DLPMS:${newCertificateNumber}`
      },
      include: { parcel: true, owner: true }
    });
  });

  await writeAudit(request, AuditAction.CertificateReissue, {
    entityType: 'Certificate',
    entityId: newCert.id,
    oldSnapshot: { previousCertificateId: id, previousCertificateNumber: oldCert.certificateNumber, status: 'Active' },
    newSnapshot: { newCertificateNumber, status: 'Active', reason: parsed.data.reason, replaces: id }
  });

  return certificateDto(newCert, { withRelations: true });
}
