import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as notificationsService from './notificationsService.js';

export const notificationsRouter = Router();
export const notificationTemplatesRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (request, response, next) => {
  try {
    const result = await notificationsService.listMyNotifications({ query: request.query, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

notificationsRouter.get('/unread', async (request, response, next) => {
  try {
    const result = await notificationsService.getMyUnreadCount({ request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch('/:id/read', async (request, response, next) => {
  try {
    const result = await notificationsService.markRead({ id: request.params.id, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

notificationTemplatesRouter.use(requireAuth, requireRoles(RoleCode.SystemAdmin));

notificationTemplatesRouter.get('/', async (_request, response, next) => {
  try {
    const result = await notificationsService.listTemplates({ request: _request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
