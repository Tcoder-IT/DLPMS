import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as auditService from './auditService.js';

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRoles(RoleCode.SystemAdmin));

auditRouter.get('/audit-logs', async (request, response, next) => {
  try {
    const result = await auditService.listAudit({ query: request.query });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

auditRouter.get('/audit-logs/export', async (request, response, next) => {
  try {
    const { csv, count } = await auditService.exportAudit({ query: request.query });
    response.setHeader('Content-Type', 'text/csv');
    response.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
    response.send(csv);
    response.locals = response.locals || {};
    response.locals.auditExportCount = count;
  } catch (error) {
    next(error);
  }
});

auditRouter.get('/audit-logs/verify', async (request, response, next) => {
  try {
    const limit = request.query.limit ? Number(request.query.limit) : 1000;
    const result = await auditService.verifyChain({ limit });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
