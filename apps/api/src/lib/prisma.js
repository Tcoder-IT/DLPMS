// Prisma client singleton for the API.
// Re-exports the generated client from the workspace root node_modules so that
// every module imports the same instance. The module-level cache means we do
// not attach anything to global objects (clean for hot-reload + tests).

import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

let cached = null;

export const db =
  cached ??
  (cached = new PrismaClient({
    log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error']
  }));
