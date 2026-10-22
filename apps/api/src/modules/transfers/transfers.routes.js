import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as transfersService from './transfersService.js';

export const transfersRouter = Router();

transfersRouter.use(requireAuth);

transfersRouter.get('/', async (request, response, next) => {
  try {
    const result = await transfersService.listTransfers({ query: request.query, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

transfersRouter.post('/', async (request, response, next) => {
  try {
    const result = await transfersService.createTransfer({ input: request.body, request });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

transfersRouter.get('/:id', async (request, response, next) => {
  try {
    const result = await transfersService.getTransfer({ id: request.params.id, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

transfersRouter.post('/:id/submit', async (request, response, next) => {
  try {
    const result = await transfersService.submitTransfer({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

transfersRouter.post('/:id/cancel', async (request, response, next) => {
  try {
    const result = await transfersService.cancelTransfer({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Officer-only mutating routes
const officerRoles = requireRoles(RoleCode.LandOfficer, RoleCode.SystemAdmin);

transfersRouter.post('/:id/request-documents', officerRoles, async (request, response, next) => {
  try {
    const result = await transfersService.requestDocuments({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

transfersRouter.post('/:id/approve', officerRoles, async (request, response, next) => {
  try {
    const result = await transfersService.approveTransfer({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

transfersRouter.post('/:id/reject', officerRoles, async (request, response, next) => {
  try {
    const result = await transfersService.rejectTransfer({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
