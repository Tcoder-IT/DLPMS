import { Router } from 'express';
import { env } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', (request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'dlpms-api',
    environment: env.nodeEnv,
    requestId: request.id
  });
});
