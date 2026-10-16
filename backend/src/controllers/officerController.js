const prisma = require('../config/db');

exports.getPendingTransfers = async (req, res) => {
  try {
    const transfers = await prisma.transferRequest.findMany({
      where: { status: 'UNDER_REVIEW' },
      include: { parcel: true, seller: true, buyer: true }
    });
    res.status(200).json(transfers);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.approveTransfer = async (req, res) => {
  try {
    const { requestId } = req.params;
    const officerId = req.user?.userId;

    // Execute atomic transaction for ownership transfer
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch transfer request with parcel and owners
      const transfer = await tx.transferRequest.findUnique({
        where: { requestId },
        include: { parcel: true, seller: true, buyer: true }
      });

      if (!transfer) {
        throw { status: 404, message: 'Transfer request not found' };
      }

      if (transfer.status !== 'UNDER_REVIEW') {
        throw {
          status: 400,
          message: `Cannot approve transfer: current status is ${transfer.status} (expected UNDER_REVIEW)`
        };
      }

      // 2. Critical validation: Verify seller is STILL the legal current owner
      if (transfer.parcel.currentOwnerId !== transfer.sellerId) {
        throw {
          status: 400,
          message: `Ownership mismatch: Seller ${transfer.seller.fullName} is no longer the registered legal owner of parcel ${transfer.parcel.parcelNumber}`
        };
      }

      // 3. Mark any other pending transfer requests on the same parcel as CANCELLED
      await tx.transferRequest.updateMany({
        where: {
          parcelId: transfer.parcelId,
          requestId: { not: requestId },
          status: 'UNDER_REVIEW'
        },
        data: {
          status: 'CANCELLED',
          officerComments: `Automatically cancelled due to approval of transfer ${transfer.trackingId}`
        }
      });

      // 4. Update the transfer request to APPROVED
      const updatedTransfer = await tx.transferRequest.update({
        where: { requestId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedByOfficerId: officerId || null
        }
      });

      // 5. Update parcel legal owner to buyer
      await tx.landParcel.update({
        where: { parcelId: transfer.parcelId },
        data: {
          currentOwnerId: transfer.buyerId,
          status: 'ACTIVE'
        }
      });

      // 6. Record immutable title deed OwnershipHistory
      const history = await tx.ownershipHistory.create({
        data: {
          parcelId: transfer.parcelId,
          previousOwnerId: transfer.sellerId,
          newOwnerId: transfer.buyerId,
          transferRequestId: transfer.requestId,
          transferPrice: transfer.salePrice,
          deedReference: `DEED-${transfer.trackingId}`,
          recordedByUserId: officerId || 'system'
        }
      });

      return { transfer: updatedTransfer, history };
    });

    res.status(200).json({
      message: 'Transfer approved and legal title ownership transferred successfully',
      transfer: result.transfer,
      history: result.history
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('approveTransfer transaction error:', error);
    res.status(500).json({ error: 'Internal server error during transfer approval' });
  }
};

exports.rejectTransfer = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const officerId = req.user?.userId;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A written rejection reason is mandatory under Dire Dawa land directives' });
    }

    const transfer = await prisma.transferRequest.findUnique({ where: { requestId } });
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer request not found' });
    }

    if (transfer.status !== 'UNDER_REVIEW') {
      return res.status(400).json({
        error: `Cannot reject transfer: current status is ${transfer.status} (expected UNDER_REVIEW)`
      });
    }

    const updatedTransfer = await prisma.transferRequest.update({
      where: { requestId },
      data: {
        status: 'REJECTED',
        officerComments: reason.trim(),
        approvedByOfficerId: officerId || null
      }
    });

    res.status(200).json({ message: 'Transfer rejected with recorded comments', transfer: updatedTransfer });
  } catch (error) {
    console.error('rejectTransfer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.registerLand = async (req, res) => {
  try {
    const { parcelNumber, ownerId, sizeSqm, landUseType, kebele } = req.body;

    const parcel = await prisma.landParcel.create({
      data: {
        parcelNumber,
        currentOwnerId: ownerId,
        sizeSqm,
        landUseType,
        kebele,
        status: 'ACTIVE'
      }
    });

    res.status(201).json({ message: 'Land registered successfully', parcel });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.generateReports = async (req, res) => {
  // Mock report generation
  res.status(200).json({ reportUrl: 'https://mock-storage.com/report-' + Date.now() + '.pdf' });
};
