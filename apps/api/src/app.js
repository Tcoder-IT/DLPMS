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
import { identityRouter } from './modules/identity/identity.routes.js';
import { sessionRouter } from './modules/identity/session.routes.js';
import { profileRouter } from './modules/profile/profile.routes.js';
import { adminUsersRouter } from './modules/admin/users.routes.js';
import { parcelsRouter } from './modules/parcels/parcels.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { transfersRouter } from './modules/transfers/transfers.routes.js';
import { taxRouter } from './modules/tax/tax.routes.js';
import { gisRouter } from './modules/gis/gis.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { webhooksRouter } from './modules/webhooks/webhooks.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '256kb' }));
  app.use(requestContext);
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));

  // Public + auth routes
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', identityRouter);
  app.use('/api/v1/auth', sessionRouter); // mount /auth/logout (requireAuth)

  // Authenticated routes
  app.use('/api/v1', profileRouter); // /api/v1/me
  app.use('/api/v1/parcels', parcelsRouter);
  app.use('/api/v1/transfers', transfersRouter);
  app.use('/api/v1/tax', taxRouter);
  app.use('/api/v1/gis', gisRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/admin', adminUsersRouter);
  app.use('/api/v1/admin', auditRouter);

  // Provider webhooks — separate from user-facing routes; signature-validated.
  app.use('/api/v1/webhooks', webhooksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
