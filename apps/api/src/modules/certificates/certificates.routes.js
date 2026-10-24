import { Router } from 'express';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { RoleCode } from '@prisma/client';
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

// Revoke a certificate — SystemAdmin only.
certificatesRouter.post('/:id/revoke', requireRoles(RoleCode.SystemAdmin), async (request, response, next) => {
  try {
    const result = await certificatesService.revokeCertificate({ id: request.params.id, input: request.body, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Reissue a certificate (replaces the old one with a new Active cert) —
// LandOfficer or SystemAdmin.
certificatesRouter.post('/:id/reissue', requireRoles(RoleCode.LandOfficer, RoleCode.SystemAdmin), async (request, response, next) => {
  try {
    const result = await certificatesService.reissueCertificate({ id: request.params.id, input: request.body, request });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
