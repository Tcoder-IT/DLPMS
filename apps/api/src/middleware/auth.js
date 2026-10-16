// Auth middleware — verifies the HS256 JWT bearer token (SECURITY_DESIGN.md),
// loads the user and role, and attaches them to request.user and request.role.
// On any failure we return a generic 401 to avoid account enumeration
// (per SECURITY_DESIGN.md: "Provide generic authentication failures").

import { db } from '../lib/prisma.js';
import { verifyToken, TOKEN_KIND } from '../utils/security.js';
import { AppError } from '../errors/AppError.js';

export async function requireAuth(request, _response, next) {
  try {
    const header = request.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }
    let payload;
    try {
      payload = await verifyToken(match[1], TOKEN_KIND.ACCESS);
    } catch (error) {
      if (error.code === 'INVALID_TOKEN_KIND') {
        throw new AppError(401, 'INVALID_TOKEN', 'Authentication failed.');
      }
      throw new AppError(401, 'INVALID_TOKEN', 'Authentication failed.');
    }

    const user = await db.user.findUnique({
      where: { id: payload.sub },
      include: { role: true }
    });
    if (!user || !user.active) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication failed.');
    }

    request.user = user;
    request.role = user.role;
    request.accessTokenJti = payload.jti;
    return next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication failed.'));
  }
}

export function requireRoles(...allowed) {
  const allowedSet = new Set(allowed);
  return function (request, _response, next) {
    const roleCode = request.role?.code;
    if (!roleCode || !allowedSet.has(roleCode)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have access to this resource.'));
    }
    return next();
  };
}
