// Documents routes. Uploads are multipart/form-data; all other endpoints
// use the standard JSON pipeline. multer is configured with an in-memory
// storage engine so we can validate magic bytes BEFORE writing to disk;
// once validation passes, the documents service persists to the storage
// adapter.

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import * as documentsService from './documentsService.js';

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

// In-memory storage so we can validate content before persisting.
// File size is enforced by multer as a first line of defense; the service
// re-checks after loading the buffer in case the limit was bypassed.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    // MIME pre-filter — defense in depth; service re-checks magic bytes.
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);
    if (file.mimetype && !allowed.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  }
});

// GET /documents — list own uploads (Citizens) / all (Staff). Paginated.
documentsRouter.get('/', async (request, response, next) => {
  try {
    const result = await documentsService.listDocuments({ query: request.query, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /documents — upload a single file. Field name: `file`.
documentsRouter.post('/', (request, response, next) => {
  upload.single('file')(request, response, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE' || err.message === 'UNSUPPORTED_FILE_TYPE') {
        return next({
          statusCode: err.code === 'LIMIT_FILE_SIZE' ? 413 : 415,
          code: err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UNSUPPORTED_FILE_TYPE',
          message: err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 10MB limit.' : 'MIME type not allowed.',
          name: 'AppError'
        });
      }
      return next(err);
    }
    documentsService.uploadDocument({ file: request.file, request }).then(
      (result) => response.status(201).json(result),
      (error) => next(error)
    );
  });
});

// GET /documents/{id} — metadata only, never the file content
documentsRouter.get('/:id', async (request, response, next) => {
  try {
    const result = await documentsService.getDocument({ id: request.params.id, request });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /documents/{id}/content — authenticated, audit-logged download. Streams
// the file from the storage adapter; never returns a public URL.
documentsRouter.get('/:id/content', async (request, response, next) => {
  try {
    await documentsService.streamDocumentContent({ id: request.params.id, request, response });
  } catch (error) {
    next(error);
  }
});
