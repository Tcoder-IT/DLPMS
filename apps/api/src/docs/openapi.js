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
    '/parcels/{id}/tax-records': {
      get: {
        summary: 'List tax records for a parcel (Citizens limited to own parcels)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Tax records for the parcel' }, ...errorResponses }
      }
    },
    '/transfers': {
      get: {
        summary: 'List transfer requests (Citizens see only their own)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Draft', 'Submitted', 'TaxVerified', 'TaxHold', 'UnderReview', 'DocumentsRequested', 'Approved', 'Rejected', 'Cancelled'] } },
          { name: 'parcelId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'search', in: 'query', schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Transfers list' }, ...errorResponses }
      },
      post: {
        summary: 'Create a draft transfer request (Citizen must be the current owner)',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['parcelId', 'buyerOwnerId', 'salePrice'],
                properties: {
                  parcelId: { type: 'string', format: 'uuid' },
                  buyerOwnerId: { type: 'string', format: 'uuid' },
                  buyerSnapshot: { type: 'object' },
                  salePrice: { type: 'number' }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Transfer created in Draft state' }, ...errorResponses }
      }
    },
    '/transfers/{id}': {
      get: { summary: 'Get a transfer request', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Transfer' }, ...errorResponses } }
    },
    '/transfers/{id}/submit': {
      post: {
        summary: 'Submit a draft transfer for processing (triggers automated tax check)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['expectedVersion'], properties: { expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Transfer submitted' }, ...errorResponses }
      }
    },
    '/transfers/{id}/cancel': {
      post: {
        summary: 'Cancel a transfer before final approval (Citizen-seller or officer)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['expectedVersion'], properties: { expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Transfer cancelled' }, ...errorResponses }
      }
    },
    '/transfers/{id}/request-documents': {
      post: {
        summary: 'Officer: request additional documents (UnderReview -> DocumentsRequested)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['message', 'expectedVersion'], properties: { message: { type: 'string' }, expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Documents requested' }, ...errorResponses }
      }
    },
    '/transfers/{id}/approve': {
      post: {
        summary: 'Officer: approve a transfer (atomically updates ownership + issues certificate + audit)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['reason', 'expectedVersion'], properties: { reason: { type: 'string' }, expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Transfer approved; ownership transferred; certificate issued' }, ...errorResponses }
      }
    },
    '/transfers/{id}/reject': {
      post: {
        summary: 'Officer: reject a transfer with documented reason',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['reason', 'expectedVersion'], properties: { reason: { type: 'string' }, expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Transfer rejected' }, ...errorResponses }
      }
    },
    '/tax': {
      get: {
        summary: 'List tax records (Citizens limited to own parcels)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'parcelId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Calculated', 'PartiallyPaid', 'Paid', 'Hold', 'Cleared'] } },
          { name: 'taxYear', in: 'query', schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'Tax records list' }, ...errorResponses }
      }
    },
    '/tax/dashboard': {
      get: { summary: 'Tax dashboard summary (TaxOfficial/SystemAdmin)', responses: { 200: { description: 'Summary' }, ...errorResponses } }
    },
    '/tax/arrears': {
      get: { summary: 'List parcels with active tax holds (TaxOfficial/SystemAdmin)', responses: { 200: { description: 'Arrears list' }, ...errorResponses } }
    },
    '/tax/records/{id}/calculate': {
      post: {
        summary: 'Calculate or recalculate tax for a parcel+year (TaxOfficial/SystemAdmin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['taxYear'], properties: { taxYear: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Tax calculated' }, ...errorResponses }
      }
    },
    '/gis/parcels': {
      get: {
        summary: 'List parcels with GIS metadata (GISOfficer/SystemAdmin)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'subCity', in: 'query', schema: { type: 'string' } },
          { name: 'kebele', in: 'query', schema: { type: 'string' } },
          { name: 'boundaryStatus', in: 'query', schema: { type: 'string', enum: ['Pending', 'Verified', 'OverlapConflict', 'Rejected'] } }
        ],
        responses: { 200: { description: 'GIS parcels list' }, ...errorResponses }
      }
    },
    '/gis/parcels/{id}/boundary': {
      get: { summary: 'Get the boundary GeoJSON for a parcel', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Boundary' }, ...errorResponses } },
      put: {
        summary: 'Upload/replace a parcel boundary GeoJSON Polygon (GISOfficer)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['geometry', 'expectedVersion'], properties: { geometry: { type: 'object', description: 'GeoJSON Polygon' }, expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Boundary stored; status reset to Pending' }, ...errorResponses }
      }
    },
    '/gis/parcels/{id}/verify': {
      post: {
        summary: 'Verify a parcel boundary against all other parcel boundaries; sets Verified or OverlapConflict',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Verification result with overlaps list' }, ...errorResponses }
      }
    },
    '/gis/boundaries/import': {
      post: {
        summary: 'Bulk import boundaries from a GeoJSON feature collection (GISOfficer)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['features'], properties: { features: { type: 'array', items: { type: 'object' } } } } } } },
        responses: { 200: { description: 'Import report' }, ...errorResponses }
      }
    },
    '/gis/overlaps': {
      get: {
        summary: 'Scan all parcel boundaries and report pairwise overlaps',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: { 200: { description: 'Overlap report' }, ...errorResponses }
      }
    },
    '/payments/initiate': {
      post: {
        summary: 'Initiate a mock telebirr payment against a tax record',
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['taxRecordId', 'amount'], properties: { taxRecordId: { type: 'string', format: 'uuid' }, amount: { type: 'number' } } } } } },
        responses: { 202: { description: 'Payment initiated; provider callback URL + signed payload returned for replay' }, ...errorResponses }
      }
    },
    '/payments/{id}': {
      get: { summary: 'Get a payment transaction', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Payment' }, ...errorResponses } }
    },
    '/payments/{id}/refund': {
      post: {
        summary: 'Refund a Completed payment (SystemAdmin only). Reverses the linked TaxRecord effects.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: { 200: { description: 'Payment refunded' }, ...errorResponses }
      }
    },
    '/webhooks/payments/{provider}': {
      post: {
        summary: 'Payment provider callback endpoint (signature-validated, idempotent, replay-protected)',
        security: [],
        parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['telebirr'] } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: {
          200: { description: 'Webhook accepted (idempotent on repeat calls)' },
          401: { description: 'Invalid signature' },
          409: { description: 'Replay window expired' }
        }
      }
    },
    '/appointments': {
      get: {
        summary: 'List appointments (Citizens see only their own; LandOfficers see assigned)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Scheduled', 'Completed', 'Cancelled', 'NoShow'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'officerId', in: 'query', schema: { type: 'string', format: 'uuid' } }
        ],
        responses: { 200: { description: 'Appointments list' }, ...errorResponses }
      },
      post: {
        summary: 'Book an appointment (Citizen/SystemAdmin). Real-time slot availability check at booking time.',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['officerId', 'serviceType', 'scheduledAt'],
                properties: {
                  officerId: { type: 'string', format: 'uuid' },
                  slotId: { type: 'string', format: 'uuid' },
                  serviceType: { type: 'string' },
                  scheduledAt: { type: 'string', format: 'date-time' },
                  purpose: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Appointment booked; SMS confirmation dispatched; 24h reminder scheduled' }, ...errorResponses }
      }
    },
    '/appointments/{id}': {
      get: { summary: 'Get an appointment (ownership-checked)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Appointment' }, ...errorResponses } },
      patch: {
        summary: 'Reschedule an appointment (ownership-checked; configurable cancellation window applies to status transitions)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['newScheduledAt', 'expectedVersion'], properties: { newScheduledAt: { type: 'string', format: 'date-time' }, expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Appointment rescheduled' }, ...errorResponses }
      }
    },
    '/appointments/{id}/cancel': {
      post: {
        summary: 'Cancel an appointment (configurable cancellation window; default 2h)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['reason', 'expectedVersion'], properties: { reason: { type: 'string' }, expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Appointment cancelled' }, ...errorResponses }
      }
    },
    '/appointment-slots': {
      get: {
        summary: 'List appointment slots (LandOfficer sees only own; SystemAdmin sees all)',
        parameters: [
          { name: 'officerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'active', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } }
        ],
        responses: { 200: { description: 'Slots list' }, ...errorResponses }
      },
      post: {
        summary: 'Create an appointment slot (LandOfficer/SystemAdmin)',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['officerId', 'serviceType', 'startsAt', 'endsAt'],
                properties: {
                  officerId: { type: 'string', format: 'uuid' },
                  serviceType: { type: 'string' },
                  startsAt: { type: 'string', format: 'date-time' },
                  endsAt: { type: 'string', format: 'date-time' },
                  capacity: { type: 'integer', default: 1 }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Slot created' }, ...errorResponses }
      }
    },
    '/certificates/{id}': {
      get: { summary: 'Get a certificate (ownership-checked)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Certificate' }, ...errorResponses } }
    },
    '/certificates/{id}/download': {
      post: {
        summary: 'Download the certificate PDF (watermarked + QR code; ownership-checked; audit-logged).',
        description: 'Per FR-32, the PDF is digitally-signed/watermarked/QR-enabled. PROJECT_DECISIONS.md: signature authority is unspecified, so the prototype watermark is explicit about not being legally binding.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
          ...errorResponses
        }
      }
    },
    '/notifications': {
      get: {
        summary: 'List my notifications (recipient-scoped)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Queued', 'Sent', 'Failed', 'Suppressed'] } },
          { name: 'channel', in: 'query', schema: { type: 'string', enum: ['sms', 'email'] } }
        ],
        responses: { 200: { description: 'Notifications list' }, ...errorResponses }
      }
    },
    '/notifications/unread': {
      get: { summary: 'Count my unread notifications', responses: { 200: { description: 'Count' }, ...errorResponses } }
    },
    '/notifications/{id}/read': {
      patch: { summary: 'Mark a notification as read (recipient-scoped)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Marked read' }, ...errorResponses } }
    },
    '/admin/notification-templates': {
      get: { summary: 'List notification templates (SystemAdmin)', responses: { 200: { description: 'Templates list' }, ...errorResponses } }
    },
    '/documents': {
      post: {
        summary: 'Upload a supporting document (PDF/PNG/JPEG, max 10MB). Magic-byte + extension + MIME + size validation.',
        description: 'Per SECURITY_DESIGN.md (File and document security): uploads are authenticated and authorized; file type is validated by content inspection, extension, MIME type, size limit, and checksum; executable/unsupported content is rejected; files are stored in private external storage; the database retains controlled metadata only — never a public URL. Every download is server-side authorized at GET /documents/{id}/content.',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'PDF, PNG, or JPEG up to 10MB' },
                  classification: { type: 'string', default: 'restricted', description: 'Default restricted; reserved for future policy-driven classification' }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Document metadata stored' }, 400: { description: 'Validation failed' }, 413: { description: 'File too large' }, 415: { description: 'Unsupported file type' } }
      }
    },
    '/documents/{id}': {
      get: {
        summary: 'Get document metadata (ownership-checked). Never returns the file content.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Document metadata' }, ...errorResponses }
      }
    },
    '/documents/{id}/content': {
      get: {
        summary: 'Download the file (authenticated, server-side authorized, audit-logged, streamed from private storage).',
        description: 'Streams the file from the storage adapter. Sets Content-Type to the file media type, Content-Disposition: attachment, X-Content-Type-Options: nosniff, Cache-Control: private, no-store. Per SECURITY_DESIGN.md, ownership is server-side checked before the file is released.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Binary file', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          ...errorResponses
        }
      }
    },
    '/transfers/{id}/documents': {
      post: {
        summary: 'Attach an uploaded document to a transfer (Citizens limited to documents they uploaded; officers may attach any document).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['documentId', 'documentType'], properties: { documentId: { type: 'string', format: 'uuid' }, documentType: { type: 'string' } } } } } },
        responses: { 201: { description: 'Document attached; idempotent on repeat calls' }, ...errorResponses }
      },
      get: {
        summary: 'List documents attached to a transfer (Citizens limited to transfers where they are a party).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'List of attached documents with their verification status' }, ...errorResponses }
      }
    },
    '/transfer-documents/{id}/review': {
      post: {
        summary: 'Officer review of a transfer document (Verified / Rejected / AdditionalRequested). Documented reason required.',
        description: 'Per WORKFLOWS.md §7: the officer records the verification result, rejection reason, or request for additional documents. Transfer decisions cannot bypass documented validation steps; review decisions and accessed sensitive records are audited.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['verificationStatus', 'reason', 'expectedVersion'], properties: { verificationStatus: { type: 'string', enum: ['Pending', 'Verified', 'Rejected', 'AdditionalRequested'] }, reason: { type: 'string' }, expectedVersion: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Document reviewed; verification status updated' }, ...errorResponses }
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
