const express = require('express');
const router = express.Router();
const apptCtrl = require('../controllers/appointmentController');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const auditLog = require('../middleware/audit');
const validate = require('../middleware/validation');
const Joi = require('joi');

// ─── Validation Schemas ───────────────────────────────────────────────────────
const bookSchema = Joi.object({
    officerId: Joi.string().required(),
    serviceType: Joi.string()
        .valid('LAND_REGISTRATION', 'TRANSFER_APPROVAL', 'DOCUMENT_VERIFICATION', 'TAX_QUERY')
        .required(),
    dateTime: Joi.date().iso().greater('now').required().messages({
        'date.greater': 'Appointment must be scheduled in the future'
    })
});

const outcomeSchema = Joi.object({
    outcome: Joi.string().valid('COMPLETED', 'NO_SHOW').required()
});

// ─── Public / Citizen Routes ─────────────────────────────────────────────────
router.get('/officers', authenticate, apptCtrl.getAvailableOfficers);
router.get('/officers/:officerId/slots', authenticate, apptCtrl.getOfficerBookedSlots);

// ─── Citizen-only Routes ─────────────────────────────────────────────────────
router.get(
    '/my',
    authenticate,
    requireRole(['CITIZEN']),
    apptCtrl.getMyAppointments
);

router.post(
    '/',
    authenticate,
    requireRole(['CITIZEN']),
    validate(bookSchema),
    auditLog('BOOK_APPOINTMENT', 'Appointment'),
    apptCtrl.bookAppointment
);

router.put(
    '/:appointmentId/cancel',
    authenticate,
    requireRole(['CITIZEN']),
    auditLog('CANCEL_APPOINTMENT', 'Appointment'),
    apptCtrl.cancelAppointment
);

// ─── Officer-only Routes ─────────────────────────────────────────────────────
router.get(
    '/queue',
    authenticate,
    requireRole(['LAND_OFFICER']),
    apptCtrl.getOfficerAppointments
);

router.put(
    '/:appointmentId/confirm',
    authenticate,
    requireRole(['LAND_OFFICER']),
    auditLog('CONFIRM_APPOINTMENT', 'Appointment'),
    apptCtrl.confirmAppointment
);

router.put(
    '/:appointmentId/outcome',
    authenticate,
    requireRole(['LAND_OFFICER']),
    validate(outcomeSchema),
    auditLog('UPDATE_APPOINTMENT_OUTCOME', 'Appointment'),
    apptCtrl.updateAppointmentOutcome
);

module.exports = router;
