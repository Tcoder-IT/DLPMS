import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as profileService from './profileService.js';

export const profileRouter = Router();

profileRouter.get('/me', requireAuth, async (request, response, next) => {
  try {
    const result = await profileService.getMyProfile({ request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

profileRouter.patch('/me', requireAuth, async (request, response, next) => {
  try {
    const result = await profileService.patchMyProfile({ input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
