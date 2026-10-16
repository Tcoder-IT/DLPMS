const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');

router.use(authenticate);
router.use(requireRole(['ADMIN']));

router.get('/users', adminController.getUsers);
router.post('/user', adminController.createUser);
router.put('/user/:id', adminController.updateUser);
router.delete('/user/:id', adminController.deleteUser);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/audit-logs/verify', adminController.verifyAuditLogs);
router.post('/backup', adminController.triggerBackup);
router.get('/config', adminController.getConfig);
router.put('/config', adminController.updateConfig);

module.exports = router;
