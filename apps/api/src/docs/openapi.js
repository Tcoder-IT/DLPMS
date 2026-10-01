export const openapiSpecification = {
  openapi: '3.0.3',
  info: {
    title: 'DLPMS API',
    version: '0.1.0',
    description: 'Foundation API for the Digital Land and Property Management System.'
  },
  servers: [{ url: 'http://localhost:4000/api/v1', description: 'Local development' }],
  paths: {
    '/health': {
      get: {
        summary: 'Service health check',
        responses: {
          200: { description: 'API is available' }
        }
      }
    }
  }
};
