import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as certificatesService from './certificatesService.js';

export const certificatesRouter = Router();

certificatesRouter.use(requireAuth);

certificatesRouter.get('/:id', async (request, response, next) => {
  try {
    const result = await certificatesService.getCertificate({ id: request.params.id, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

certificatesRouter.post('/:id/download', async (request, response, next) => {
  try {
    const { pdf, filename } = await certificatesService.downloadCertificatePdf({ id: request.params.id, request });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', String(pdf.length));
    return response.send(pdf);
  } catch (error) {
    next(error);
  }
});
