import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as parcelsService from './parcelsService.js';
import * as taxService from '../tax/taxService.js';

export const parcelsRouter = Router();

parcelsRouter.use(requireAuth);

parcelsRouter.get('/', async (request, response, next) => {
  try {
    const result = await parcelsService.listParcels({ query: request.query });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

parcelsRouter.get('/:id', async (request, response, next) => {
  try {
    const result = await parcelsService.getParcel({ id: request.params.id });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

parcelsRouter.get('/:id/ownership-history', async (request, response, next) => {
  try {
    const result = await parcelsService.listOwnershipHistory({ id: request.params.id });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Parcel tax records — ownership-checked inside service (Citizen cannot read others' parcels).
parcelsRouter.get('/:id/tax-records', async (request, response, next) => {
  try {
    const result = await taxService.listParcelTaxRecords({ parcelId: request.params.id, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Mutating routes restricted to LandOfficer and SystemAdmin.
const writeRoles = requireRoles(RoleCode.LandOfficer, RoleCode.SystemAdmin);
parcelsRouter.post('/', writeRoles, async (request, response, next) => {
  try {
    const result = await parcelsService.createParcel({ input: request.body, request });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

parcelsRouter.patch('/:id', writeRoles, async (request, response, next) => {
  try {
    const result = await parcelsService.patchParcel({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
