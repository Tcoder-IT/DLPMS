import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as appointmentsService from './appointmentsService.js';

export const appointmentsRouter = Router();
export const appointmentSlotsRouter = Router();

appointmentsRouter.use(requireAuth);

appointmentsRouter.get('/', async (request, response, next) => {
  try {
    const result = await appointmentsService.listAppointments({ query: request.query, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.post('/', requireRoles(RoleCode.Citizen, RoleCode.SystemAdmin), async (request, response, next) => {
  try {
    const result = await appointmentsService.bookAppointment({ input: request.body, request });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.get('/:id', async (request, response, next) => {
  try {
    const result = await appointmentsService.getAppointment({ id: request.params.id, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.patch('/:id', async (request, response, next) => {
  try {
    const result = await appointmentsService.rescheduleAppointment({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.post('/:id/cancel', async (request, response, next) => {
  try {
    const result = await appointmentsService.cancelAppointment({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Slot management — LandOfficer (own slots) and SystemAdmin (any).
appointmentSlotsRouter.use(requireAuth, requireRoles(RoleCode.LandOfficer, RoleCode.SystemAdmin));

appointmentSlotsRouter.get('/', async (request, response, next) => {
  try {
    const result = await appointmentsService.listSlots({ query: request.query, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

appointmentSlotsRouter.post('/', async (request, response, next) => {
  try {
    const result = await appointmentsService.createSlot({ input: request.body, request });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
