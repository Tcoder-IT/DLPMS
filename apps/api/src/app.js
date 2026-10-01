import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openapiSpecification } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandlers.js';
import { requestContext } from './middleware/requestContext.js';
import { healthRouter } from './routes/health.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestContext);
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));
  app.use('/api/v1/health', healthRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
