const { recordAuditLog } = require('../services/auditService');

const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    // Intercept response to log only upon successful operations
    const originalSend = res.send;
    res.send = async function (body) {
      res.send = originalSend;
      res.send(body);

      // Only log on successful mutations (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300 && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        try {
          const userId = req.user ? req.user.userId : null;
          const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

          let entityId = 'unknown';
          if (req.params.requestId) entityId = req.params.requestId;
          else if (req.params.id) entityId = req.params.id;
          else if (req.params.parcelId) entityId = req.params.parcelId;
          else if (body && typeof body === 'string') {
            try {
              const parsed = JSON.parse(body);
              if (parsed.requestId) entityId = parsed.requestId;
              else if (parsed.parcelId) entityId = parsed.parcelId;
              else if (parsed.userId) entityId = parsed.userId;
              else if (parsed.id) entityId = parsed.id;
            } catch (e) { }
          }

          // Asynchronously record canonical audit entry
          await recordAuditLog({
            userId,
            ipAddress,
            action,
            entityType,
            entityId,
            newValue: req.body
          });
        } catch (error) {
          console.error('Audit log middleware error:', error);
        }
      }
    };
    next();
  };
};

module.exports = auditLog;
