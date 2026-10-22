const express = require('express');
const router = express.Router();
const officerController = require('../controllers/officerController');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

router.use(authenticate);
router.use(requireRole(['LAND_OFFICER', 'ADMIN']));

router.get('/transfers', officerController.getPendingTransfers);
router.put('/transfers/:requestId/approve', officerController.approveTransfer);
router.put('/transfers/:requestId/reject', officerController.rejectTransfer);
router.post('/land/register', officerController.registerLand);
router.get('/reports', officerController.generateReports);

module.exports = router;
