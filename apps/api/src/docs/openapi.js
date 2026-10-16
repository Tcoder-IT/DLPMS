// OpenAPI 3.0 spec for the DLPMS API. Kept in sync with the implemented routes.
// Serves /api-docs (NFR-10). Schemas are intentionally permissive; for full
// validation, consult the zod schemas in each service module.

const securitySchemes = {
  BearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Use `Authorization: Bearer <accessToken>`. Tokens issued at POST /auth/login or /auth/register.'
  }
};

const errorResponses = {
  400: {
    description: 'Validation failed',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/Error'
        }
      }
    }
  },
  401: {
    description: 'Unauthenticated',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  },
  403: {
    description: 'Forbidden',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  },
  404: {
    description: 'Not found',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  },
  409: {
    description: 'Conflict / stale version',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  }
};

const sessionSchema = {
  type: 'object',
  properties: {
    user: { $ref: '#/components/schemas/UserPublic' },
    accessToken: { type: 'string' },
    accessTokenExpiresIn: { type: 'integer' },
    accessTokenJti: { type: 'string' },
    refreshToken: { type: 'string' },
    refreshTokenExpiresIn: { type: 'integer' }
  }
};

export const openapiSpecification = {
  openapi: '3.0.3',
  info: {
    title: 'DLPMS API',
    version: '0.2.0',
    description:
      'Digital Land and Property Management System — REST API. Implements identity, profile, parcels, audit, and admin user management per REQUIREMENTS.md, ARCHITECTURE.md, and API_DESIGN.md. JWT bearer authentication with RBAC; audit log entries are SHA-256 hash-chained (NFR-07).'
  },
  servers: [{ url: 'http://localhost:4000/api/v1', description: 'Local development' }],
  components: {
    securitySchemes,
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              requestId: { type: 'string' },
              details: { type: 'object' }
            }
          }
        }
      },
      UserPublic: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          phoneNumber: { type: 'string' },
          email: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['Citizen', 'LandOfficer', 'TaxOfficial', 'GISOfficer', 'SystemAdmin'] },
          preferredLanguage: { type: 'string', enum: ['en', 'am'] },
          active: { type: 'boolean' },
          otpVerified: { type: 'boolean' },
          ownerProfile: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              fullName: { type: 'string' },
              nationalId: { type: 'string' },
              physicalAddress: { type: 'string' },
              contactPhone: { type: 'string', nullable: true },
              contactEmail: { type: 'string', nullable: true }
            }
          }
        }
      },
      Parcel: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          parcelNumber: { type: 'string' },
          currentOwner: { type: 'object', nullable: true },
          subCity: { type: 'string' },
          kebele: { type: 'string' },
          location: { type: 'string' },
          declaredSize: { type: 'number' },
          sizeUnit: { type: 'string' },
          landUseType: { type: 'string' },
          boundaryStatus: {
            type: 'string',
            enum: ['Pending', 'Verified', 'OverlapConflict', 'Rejected']
          },
          boundaryJson: { type: 'object', nullable: true },
          version: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      AuditLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          actorUserId: { type: 'string', format: 'uuid', nullable: true },
          action: { type: 'string' },
          entityType: { type: 'string' },
          entityId: { type: 'string', nullable: true },
          requestId: { type: 'string', nullable: true },
          ipAddress: { type: 'string', nullable: true },
          oldSnapshot: { type: 'object', nullable: true },
          newSnapshot: { type: 'object', nullable: true },
          previousHash: { type: 'string', nullable: true },
          entryHash: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  security: [{ BearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'Service health check',
        security: [],
        responses: { 200: { description: 'API is available' } }
      }
    },
    '/auth/register': {
      post: {
        summary: 'Register a new citizen',
        security: [],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phoneNumber', 'password', 'fullName', 'nationalId', 'physicalAddress'],
                properties: {
                  phoneNumber: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8, maxLength: 128 },
                  fullName: { type: 'string' },
                  nationalId: { type: 'string' },
                  physicalAddress: { type: 'string' },
                  contactPhone: { type: 'string' },
                  contactEmail: { type: 'string', format: 'email' },
                  preferredLanguage: { type: 'string', enum: ['en', 'am'], default: 'en' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Session created', content: { 'application/json': { schema: sessionSchema } } },
          ...errorResponses
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate with phone/email + password',
        security: [],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['identifier', 'password'],
                properties: {
                  identifier: { type: 'string' },
                  password: { type: 'string' },
                  otpCode: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Session created', content: { 'application/json': { schema: sessionSchema } } },
          ...errorResponses
        }
      }
    },
    '/auth/otp/request': {
      post: {
        summary: 'Request a one-time password',
        security: [],
        responses: { 200: { description: 'OTP issued (or suppressed to avoid enumeration)' } }
      }
    },
    '/auth/otp/verify': {
      post: {
        summary: 'Verify OTP and obtain a session',
        security: [],
        responses: { 200: { description: 'Session created' } }
      }
    },
    '/auth/token/refresh': {
      post: {
        summary: 'Rotate access and refresh tokens',
        security: [],
        responses: { 200: { description: 'Session rotated' } }
      }
    },
    '/auth/logout': {
      post: {
        summary: 'Revoke refresh token',
        responses: { 200: { description: 'Logged out' } }
      }
    },
    '/me': {
      get: { summary: 'Get my profile', responses: { 200: { description: 'Profile' } } },
      patch: { summary: 'Update my profile', responses: { 200: { description: 'Profile updated' } } }
    },
    '/parcels': {
      get: {
        summary: 'List parcels (paginated)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'subCity', in: 'query', schema: { type: 'string' } },
          { name: 'kebele', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Parcels list' } }
      },
      post: {
        summary: 'Register a new land parcel (LandOfficer/SystemAdmin)',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['parcelNumber', 'currentOwnerNationalId', 'subCity', 'kebele', 'location', 'declaredSize', 'landUseType'],
                properties: {
                  parcelNumber: { type: 'string' },
                  currentOwnerNationalId: { type: 'string' },
                  subCity: { type: 'string' },
                  kebele: { type: 'string' },
                  location: { type: 'string' },
                  declaredSize: { type: 'number' },
                  sizeUnit: { type: 'string', default: 'square_meters' },
                  landUseType: { type: 'string' },
                  boundaryJson: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Parcel created' },
          ...errorResponses
        }
      }
    },
    '/parcels/{id}': {
      get: { summary: 'Get a parcel', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Parcel' } } },
      patch: {
        summary: 'Update a parcel (optimistic concurrency: expectedVersion required)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['expectedVersion'] } } } },
        responses: { 200: { description: 'Parcel updated' }, ...errorResponses }
      }
    },
    '/parcels/{id}/ownership-history': {
      get: {
        summary: 'List ownership history for a parcel',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Ownership chain' } }
      }
    },
    '/admin/users': {
      get: { summary: 'List users (SystemAdmin)', responses: { 200: { description: 'User list' } } }
    },
    '/admin/users/{id}': {
      get: { summary: 'Get user detail (SystemAdmin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'User detail' } } }
    },
    '/admin/users/{id}/role': {
      patch: { summary: 'Assign role (SystemAdmin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Role updated' } } }
    },
    '/admin/users/{id}/deactivate': {
      post: { summary: 'Deactivate a user (SystemAdmin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'User deactivated' } } }
    },
    '/admin/roles': {
      get: { summary: 'List roles (SystemAdmin)', responses: { 200: { description: 'Role list' } } }
    },
    '/admin/audit-logs': {
      get: {
        summary: 'List audit entries (SystemAdmin)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'actorUserId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'entityType', in: 'query', schema: { type: 'string' } },
          { name: 'entityId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } }
        ],
        responses: { 200: { description: 'Audit entries' } }
      }
    },
    '/admin/audit-logs/export': {
      get: {
        summary: 'Export audit entries as CSV (SystemAdmin). Sensitive snapshots are excluded from CSV.',
        responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } } }
      }
    },
    '/admin/audit-logs/verify': {
      get: {
        summary: 'Verify the audit hash chain (SystemAdmin)',
        responses: { 200: { description: 'Chain integrity' } }
      }
    }
  }
};
