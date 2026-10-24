import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as settingsService from './settingsService.js';

export const settingsRouter = Router();

// All settings routes are SystemAdmin-only per FR-27 ("Configure system
// parameters" — actor: System Admin).
settingsRouter.use(requireAuth, requireRoles(RoleCode.SystemAdmin));

settingsRouter.get('/', async (request, response, next) => {
  try {
    const result = await settingsService.listSettings({ request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

settingsRouter.get('/:key', async (request, response, next) => {
  try {
    const result = await settingsService.getSetting({ key: request.params.key, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch('/:key', async (request, response, next) => {
  try {
    const result = await settingsService.updateSetting({ key: request.params.key, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
