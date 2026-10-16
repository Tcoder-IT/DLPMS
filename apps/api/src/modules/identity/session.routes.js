import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as identityService from '../identity/identityService.js';

export const sessionRouter = Router();

sessionRouter.post('/logout', requireAuth, async (request, response, next) => {
  try {
    const result = await identityService.logout({ request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
