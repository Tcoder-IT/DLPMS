import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
import * as usersService from './usersService.js';

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requireRoles(RoleCode.SystemAdmin));

adminUsersRouter.get('/users', async (request, response, next) => {
  try {
    const result = await usersService.listUsers({ query: request.query });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

adminUsersRouter.get('/users/:id', async (request, response, next) => {
  try {
    const result = await usersService.getUser({ id: request.params.id });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

adminUsersRouter.get('/roles', async (_request, response, next) => {
  try {
    const result = await usersService.listRoles();
    response.json(result);
  } catch (error) {
    next(error);
  }
});

adminUsersRouter.patch('/users/:id/role', async (request, response, next) => {
  try {
    const result = await usersService.assignRole({
      id: request.params.id,
      input: request.body,
      request
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

adminUsersRouter.post('/users/:id/deactivate', async (request, response, next) => {
  try {
    const result = await usersService.deactivateUser({
      id: request.params.id,
      input: request.body,
      request
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
