const prisma = require('../config/db');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');

exports.getParcels = async (req, res) => {
  try {
    const owner = await prisma.owner.findUnique({ where: { userId: req.user.userId } });
    if (!owner) return res.status(404).json({ error: 'Owner profile not found' });

    const parcels = await prisma.landParcel.findMany({
      where: { currentOwnerId: owner.ownerId },
      include: { taxRecords: true, gisData: true }
    });

    res.status(200).json(parcels);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.applyTransfer = async (req, res) => {
  try {
    const { parcelId, buyerNationalId, salePrice, documents } = req.body;

    const seller = await prisma.owner.findUnique({ where: { userId: req.user.userId } });
    const buyer = await prisma.owner.findUnique({ where: { nationalId: buyerNationalId } });

    if (!seller || !buyer) {
      return res.status(400).json({ error: 'Invalid seller or buyer' });
    }

    const parcel = await prisma.landParcel.findUnique({ where: { parcelId } });
    if (!parcel || parcel.currentOwnerId !== seller.ownerId) {
      return res.status(403).json({ error: 'Not authorized or parcel not found' });
    }

    const trackingId = 'TRK-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const transfer = await prisma.transferRequest.create({
      data: {
        trackingId,
        parcelId,
        sellerId: seller.ownerId,
        buyerId: buyer.ownerId,
        salePrice,
        status: 'UNDER_REVIEW',
        documents: documents
      }
    });

    res.status(201).json({ message: 'Transfer request submitted', trackingId, requestId: transfer.requestId });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.uploadDocument = async (req, res) => {
  // In a real scenario, use multer and upload to AWS S3 / local storage.
  // We'll mock it here.
  res.status(200).json({ fileUrl: 'https://mock-storage.com/doc-' + Date.now() + '.pdf' });
};

exports.getTransferStatus = async (req, res) => {
  try {
    const { trackingId } = req.params;
    const transfer = await prisma.transferRequest.findUnique({
      where: { trackingId },
      include: { parcel: true, buyer: true }
    });

    if (!transfer) return res.status(404).json({ error: 'Transfer request not found' });

    res.status(200).json(transfer);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.downloadCertificate = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const owner = await prisma.owner.findUnique({ where: { userId: req.user.userId } });
    const parcel = await prisma.landParcel.findUnique({ where: { parcelId, currentOwnerId: owner?.ownerId } });

    if (!parcel) return res.status(404).json({ error: 'Parcel not found' });

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=certificate-${parcel.parcelNumber}.pdf`);

    doc.pipe(res);
    doc.fontSize(25).text('Land Ownership Certificate', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(`Parcel Number: ${parcel.parcelNumber}`);
    doc.text(`Owner: ${owner.fullName}`);
    doc.text(`Size: ${parcel.sizeSqm} sqm`);
    doc.text(`Kebele: ${parcel.kebele}`);
    doc.text(`Registration Date: ${parcel.registrationDate.toDateString()}`);

    // Digital Signature mock
    const signature = crypto.createSign('SHA256').update(parcel.parcelId).sign(process.env.JWT_SECRET || 'secret', 'hex');
    doc.moveDown();
    doc.fontSize(10).text(`Digital Signature: ${signature}`);

    doc.end();
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
};

exports.bookAppointment = async (req, res) => {
  try {
    const { officerId, serviceType, dateTime } = req.body;

    const appointment = await prisma.appointment.create({
      data: {
        citizenId: req.user.userId,
        officerId,
        serviceType,
        dateTime: new Date(dateTime)
      }
    });

    res.status(201).json({ message: 'Appointment booked successfully', appointment });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.initiatePayment = async (req, res) => {
  // Telebirr mock initiation
  res.status(200).json({ paymentUrl: 'https://telebirr.mock/pay?token=' + Date.now() });
};
