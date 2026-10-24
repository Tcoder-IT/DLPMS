import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as publicService from './publicService.js';

export const publicRouter = Router();

// Public endpoint rate limit — stricter than the authed API. Per
// SECURITY_DESIGN.md "Implement abuse controls for login, OTP, password
// recovery, uploads, public search, and webhook endpoints."
const publicSearchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 20,               // 20 searches per minute per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many public search requests. Try later.' } }
});

publicRouter.get('/parcels/search', publicSearchLimiter, async (request, response, next) => {
  try {
    const result = await publicService.searchPublicParcels({ query: request.query, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
