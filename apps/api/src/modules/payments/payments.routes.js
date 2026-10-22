import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as paymentsService from './paymentsService.js';

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth);

paymentsRouter.post('/initiate', async (request, response, next) => {
  try {
    const result = await paymentsService.initiatePayment({ input: request.body, request });
    response.status(202).json(result);
  } catch (error) {
    next(error);
  }
});

paymentsRouter.get('/:id', async (request, response, next) => {
  try {
    const result = await paymentsService.getPayment({ id: request.params.id, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post('/:id/refund', requireRoles(RoleCode.SystemAdmin), async (request, response, next) => {
  try {
    const result = await paymentsService.refundPayment({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
