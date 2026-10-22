// Receipt PDF generator — UC-03 step 9: "System generates a tax receipt (PDF)".
// Per WORKFLOWS.md §4 step 4 and §3.3.2 sequence diagram. The receipt captures
// the payment amount, tax year, parcel number, payer name, transaction
// reference, completion timestamp, and a QR code linking back to the payment
// verification endpoint.
//
// Mirrors the certificate PDF generator (M5) but for payment receipts.
// PROJECT_DECISIONS.md: receipt signing authority is unspecified, so the
// prototype watermark is explicit about not being legally binding.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { db } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction, PaymentStatus, RoleCode } from '@prisma/client';

export async function downloadReceiptPdf({ id, request }) {
  const payment = await db.paymentTransaction.findUnique({
    where: { id },
    include: { taxRecord: { include: { parcel: true } }, payer: true }
  });
  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', 'Payment not found.');
  }
  if (payment.status !== PaymentStatus.Completed) {
    throw new AppError(409, 'NOT_DOWNLOADABLE', `Receipt is only available for Completed payments; this payment is ${payment.status}.`);
  }
  // Server-side ownership: payer, OR SystemAdmin/TaxOfficial.
  const roleCode = request.role?.code;
  if (roleCode === RoleCode.Citizen && payment.payerOwnerId !== request.user.ownerProfile?.id) {
    throw new AppError(403, 'FORBIDDEN', 'You can only download receipts for your own payments.');
  }

  await writeAudit(request, AuditAction.DocumentDownload, {
    entityType: 'PaymentTransaction',
    entityId: id,
    newSnapshot: { transactionRef: payment.transactionRef, downloadedAt: new Date().toISOString() }
  });

  const pdf = await renderReceiptPdf(payment);
  return { pdf, filename: `receipt-${payment.transactionRef}.pdf` };
}

async function renderReceiptPdf(payment) {
  const doc = new PDFDocument({ size: 'A5', margin: 50 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Watermark
  const { width, height } = doc.page.size;
  doc.save();
  doc.translate(width / 2, height / 2);
  doc.rotate(45);
  doc.fillColor('#e5e5e5');
  doc.fontSize(36).font('Helvetica-Bold').opacity(0.4);
  doc.text('PROTOTYPE — NOT LEGALLY BINDING', { width: 600, align: 'center' });
  doc.restore();

  doc.fontSize(16).font('Helvetica-Bold').text('DIRE DAWA LAND ADMINISTRATION', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).font('Helvetica').text('Property Tax Payment Receipt', { align: 'center' });
  doc.moveDown(0.8);

  doc.fontSize(9).font('Helvetica-Bold').text('Transaction Reference: ', { continued: true });
  doc.font('Helvetica').text(payment.transactionRef);
  doc.font('Helvetica-Bold').text('Receipt Date: ', { continued: true });
  doc.font('Helvetica').text(payment.completedAt.toISOString());
  doc.font('Helvetica-Bold').text('Status: ', { continued: true });
  doc.font('Helvetica').text(payment.status);
  doc.moveDown(0.5);

  doc.fontSize(11).font('Helvetica-Bold').text('Payment details');
  doc.fontSize(9).font('Helvetica');
  doc.text(`Amount: ${Number(payment.amount).toFixed(2)} ETB`);
  doc.text(`Method: ${payment.method}`);
  if (payment.taxRecord) {
    doc.text(`Tax year: ${payment.taxRecord.taxYear}`);
    doc.text(`Calculated amount: ${Number(payment.taxRecord.calculatedAmount).toFixed(2)} ETB`);
    doc.text(`Paid to date: ${Number(payment.taxRecord.paidAmount).toFixed(2)} ETB`);
    if (payment.taxRecord.parcel) {
      doc.text(`Parcel: ${payment.taxRecord.parcel.parcelNumber}`);
      doc.text(`Location: ${payment.taxRecord.parcel.location}, ${payment.taxRecord.parcel.kebele}, ${payment.taxRecord.parcel.subCity}`);
    }
  }
  doc.moveDown(0.5);
  if (payment.payer) {
    doc.fontSize(11).font('Helvetica-Bold').text('Payer');
    doc.fontSize(9).font('Helvetica');
    doc.text(`Name: ${payment.payer.fullName}`);
    doc.text(`National ID: ${payment.payer.nationalId}`);
  }
  doc.moveDown(0.5);

  // QR code linking back to the payment verification endpoint.
  const verificationUrl = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000'}/api/v1/payments/${payment.id}`;
  const qrPng = await QRCode.toBuffer(verificationUrl, { width: 180, margin: 1 });
  doc.image(qrPng, { width: 110, align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(7).font('Helvetica-Oblique').fillColor('#888').text(
    'Scan to verify this receipt at the DLPMS verification endpoint. ' +
    'Receipt produced by the DLPMS prototype; signature authority pending.',
    { align: 'center' }
  );

  doc.end();
  return done;
}
