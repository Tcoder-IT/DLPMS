import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as reportsService from './reportsService.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get('/registrations', async (request, response, next) => {
  try {
    const result = await reportsService.registrationsReport({ query: request.query, request, response });
    if (!response.headersSent) response.json(result);
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/transfers', async (request, response, next) => {
  try {
    const result = await reportsService.transfersReport({ query: request.query, request, response });
    if (!response.headersSent) response.json(result);
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/tax-compliance', async (request, response, next) => {
  try {
    const result = await reportsService.taxComplianceReport({ query: request.query, request, response });
    if (!response.headersSent) response.json(result);
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/operations', async (request, response, next) => {
  try {
    const result = await reportsService.operationsReport({ query: request.query, request, response });
    if (!response.headersSent) response.json(result);
  } catch (error) {
    next(error);
  }
});
