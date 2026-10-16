const express = require('express');
const router = express.Router();
const citizenController = require('../controllers/citizenController');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const auditLog = require('../middleware/audit');
const validate = require('../middleware/validation');
const Joi = require('joi');

router.use(authenticate);
router.use(requireRole(['CITIZEN']));

const transferSchema = Joi.object({
  parcelId: Joi.string().required(),
  buyerNationalId: Joi.string().required(),
  salePrice: Joi.number().min(0).required(),
  documents: Joi.array().items(Joi.string()).required()
});

const appointmentSchema = Joi.object({
  officerId: Joi.string().required(),
  serviceType: Joi.string().valid('LAND_REGISTRATION', 'TRANSFER_APPROVAL', 'DOCUMENT_VERIFICATION', 'TAX_QUERY').required(),
  dateTime: Joi.date().iso().required()
});

router.get('/parcels', citizenController.getParcels);
router.post('/transfer', validate(transferSchema), auditLog('TRANSFER_APPLICATION', 'TransferRequest'), citizenController.applyTransfer);
router.post('/upload', auditLog('DOCUMENT_UPLOAD', 'Document'), citizenController.uploadDocument);
router.get('/status/:trackingId', citizenController.getTransferStatus);
router.get('/certificate/:parcelId', auditLog('DOWNLOAD_CERTIFICATE', 'LandParcel'), citizenController.downloadCertificate);
router.post('/payment/initiate', auditLog('INITIATE_PAYMENT', 'PaymentTransaction'), citizenController.initiatePayment);
// NOTE: Appointment booking has been moved to /api/appointments/*

module.exports = router;
