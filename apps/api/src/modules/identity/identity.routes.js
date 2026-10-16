import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as identityService from './identityService.js';

export const identityRouter = Router();

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many OTP requests. Try later.' } }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try later.' } }
});

identityRouter.post('/register', async (request, response, next) => {
  try {
    const result = await identityService.registerCitizen({ input: request.body, request });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

identityRouter.post('/login', loginLimiter, async (request, response, next) => {
  try {
    const result = await identityService.login({ input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

identityRouter.post('/otp/request', otpLimiter, async (request, response, next) => {
  try {
    const result = await identityService.requestOtp({ input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

identityRouter.post('/otp/verify', otpLimiter, async (request, response, next) => {
  try {
    const result = await identityService.verifyOtpLogin({ input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

identityRouter.post('/token/refresh', async (request, response, next) => {
  try {
    const result = await identityService.refresh({ input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
