import { AppError } from '../errors/AppError.js';

export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.originalUrl} was not found.`
    }
  });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  const knownError = error instanceof AppError;
  const statusCode = knownError ? error.statusCode : 500;
  const code = knownError ? error.code : 'INTERNAL_SERVER_ERROR';
  const message = knownError ? error.message : 'An unexpected error occurred.';

  if (!knownError) {
    console.error({ requestId: request.id, error });
  }

  return response.status(statusCode).json({
    error: {
      code,
      message,
      requestId: request.id,
      ...(knownError && error.details ? { details: error.details } : {})
    }
  });
}
