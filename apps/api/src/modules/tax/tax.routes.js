import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as taxService from './taxService.js';

export const taxRouter = Router();

taxRouter.use(requireAuth);

taxRouter.get('/', async (request, response, next) => {
  try {
    const result = await taxService.listTaxRecords({ query: request.query, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

taxRouter.get('/dashboard', async (request, response, next) => {
  try {
    const result = await taxService.getDashboard({ request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

taxRouter.get('/arrears', async (request, response, next) => {
  try {
    const result = await taxService.listArrears({ request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Calculate — TaxOfficial or SystemAdmin only.
const taxRoles = requireRoles(RoleCode.TaxOfficial, RoleCode.SystemAdmin);
taxRouter.post('/records/:id/calculate', taxRoles, async (request, response, next) => {
  try {
    const result = await taxService.calculateTax({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
