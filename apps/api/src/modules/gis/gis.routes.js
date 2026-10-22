import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as gisService from './gisService.js';

export const gisRouter = Router();

gisRouter.use(requireAuth, requireRoles(RoleCode.GISOfficer, RoleCode.SystemAdmin));

gisRouter.get('/parcels', async (request, response, next) => {
  try {
    const result = await gisService.listGisParcels({ query: request.query });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

gisRouter.get('/parcels/:id/boundary', async (request, response, next) => {
  try {
    const result = await gisService.getParcelBoundary({ id: request.params.id });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

gisRouter.put('/parcels/:id/boundary', async (request, response, next) => {
  try {
    const result = await gisService.putBoundary({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

gisRouter.post('/parcels/:id/verify', async (request, response, next) => {
  try {
    const result = await gisService.verifyBoundary({ id: request.params.id, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

gisRouter.post('/boundaries/import', async (request, response, next) => {
  try {
    const result = await gisService.importBoundaries({ input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

gisRouter.get('/overlaps', async (request, response, next) => {
  try {
    const result = await gisService.listOverlaps({ query: request.query });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
