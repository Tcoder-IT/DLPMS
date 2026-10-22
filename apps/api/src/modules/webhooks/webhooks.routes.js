import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as webhooksService from './webhooksService.js';

export const webhooksRouter = Router();

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many webhook callbacks. Try later.' } }
});

// Provider signature header mapping — extensible per provider.
const SIGNATURE_HEADERS = {
  telebirr: 'x-telebirr-signature'
};

webhooksRouter.post('/payments/:provider', webhookLimiter, async (request, response, next) => {
  try {
    const sigHeader = SIGNATURE_HEADERS[request.params.provider];
    const signature = sigHeader ? (request.get(sigHeader) ?? '') : '';
    const result = await webhooksService.handlePaymentWebhook({
      provider: request.params.provider,
      body: request.body,
      signature,
      requestId: request.id
    });
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
