// Identity module service — orchestrates user registration, login, OTP issue/
// verify, and JWT issuance. Database writes go through Prisma; audit entries
// are written via the audit middleware helper.
//
// SECURITY_DESIGN.md: bcrypt cost factor 12; short-lived access tokens (15 min);
// refresh tokens (7 days); generic auth failures; OTP behind an adapter.

import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import {
  hashPassword,
  verifyPassword,
  normalizePhone,
  issueAccessToken,
  issueRefreshToken,
  verifyToken,
  verifyOtp,
  TOKEN_KIND
} from '../../utils/security.js';
import { dispatchOtp } from '../../lib/otpProvider.js';
import { writeAudit } from '../../middleware/auditMiddleware.js';
import { AuditAction } from '@prisma/client';

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const OTP_TTL_MS = 5 * 60 * 1000;

const registerSchema = z.object({
  phoneNumber: z.string().min(7).max(20),
  email: z.string().email().max(254).optional(),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  fullName: z.string().min(1).max(200),
  nationalId: z.string().min(1).max(50),
  physicalAddress: z.string().min(1).max(500),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().max(254).optional(),
  preferredLanguage: z.enum(['en', 'am']).default('en')
});

const loginSchema = z.object({
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
  otpCode: z.string().min(6).max(8).optional()
});

const otpRequestSchema = z.object({ identifier: z.string().min(1).max(254) });
const otpVerifySchema = z.object({
  identifier: z.string().min(1).max(254),
  otpCode: z.string().min(6).max(8)
});
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export async function registerCitizen({ input, request }) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
    });
  }
  const body = parsed.data;
  const normalizedPhone = normalizePhone(body.phoneNumber);

  const existing = await db.user.findFirst({
    where: { OR: [{ normalizedPhone }, { email: body.email ?? undefined }] }
  });
  if (existing) {
    // Generic message per SECURITY_DESIGN.md — do not confirm which field collided.
    throw new AppError(409, 'REGISTRATION_CONFLICT', 'Registration could not be completed.');
  }

  const citizenRole = await db.role.findUnique({ where: { code: 'Citizen' } });
  if (!citizenRole) {
    throw new AppError(500, 'ROLE_SEED_MISSING', 'Citizen role not seeded.');
  }

  const passwordHash = await hashPassword(body.password);
  const user = await db.user.create({
    data: {
      roleId: citizenRole.id,
      phoneNumber: body.phoneNumber,
      normalizedPhone,
      email: body.email,
      passwordHash,
      preferredLanguage: body.preferredLanguage,
      ownerProfile: {
        create: {
          fullName: body.fullName,
          nationalId: body.nationalId,
          physicalAddress: body.physicalAddress,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail
        }
      }
    },
    include: { role: true, ownerProfile: true }
  });

  await writeAudit(request, AuditAction.Create, {
    entityType: 'User',
    entityId: user.id,
    newSnapshot: { id: user.id, roleId: user.roleId, phoneNumber: user.phoneNumber, email: user.email }
  });

  return await issueSession({ user, request, auditAction: null });
}

export async function requestOtp({ input, request }) {
  const parsed = otpRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.');
  }
  const identifier = parsed.data.identifier.trim();
  const user = await db.user.findFirst({
    where: { OR: [{ normalizedPhone: normalizePhone(identifier) }, { email: identifier.toLowerCase() }] },
    include: { role: true }
  });

  // Generic response shape — avoid account enumeration.
  if (!user || !user.active) {
    return { delivered: false, devCode: null };
  }

  const { codeHash, code } = await dispatchOtp({ user, purpose: 'login' });
  await db.user.update({
    where: { id: user.id },
    data: { otpCodeHash: codeHash, otpIssuedAt: new Date(), otpAttempts: 0, otpVerifiedAt: null }
  });
  await writeAudit(request, AuditAction.OtpIssue, {
    entityType: 'User',
    entityId: user.id,
    newSnapshot: { otpIssuedAt: new Date().toISOString() }
  });
  return { delivered: true, devCode: env.isProduction ? null : code };
}

export async function verifyOtpLogin({ input, request }) {
  const parsed = otpVerifySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.');
  }
  const identifier = parsed.data.identifier.trim();
  const user = await db.user.findFirst({
    where: { OR: [{ normalizedPhone: normalizePhone(identifier) }, { email: identifier.toLowerCase() }] },
    include: { role: true }
  });
  if (!user || !user.active) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication failed.');
  }
  if (env.otpMaxAttempts && user.otpAttempts >= env.otpMaxAttempts) {
    throw new AppError(429, 'OTP_ATTEMPT_LIMIT', 'OTP attempt limit reached. Request a new code.');
  }
  const issuedAt = user.otpIssuedAt ? new Date(user.otpIssuedAt).getTime() : 0;
  if (!user.otpCodeHash || Date.now() - issuedAt > OTP_TTL_MS) {
    throw new AppError(401, 'OTP_EXPIRED', 'OTP expired. Request a new code.');
  }
  const ok = await verifyOtp(parsed.data.otpCode, user.otpCodeHash);
  await db.user.update({
    where: { id: user.id },
    data: { otpAttempts: { increment: 1 } }
  });
  if (!ok) {
    throw new AppError(401, 'OTP_INVALID', 'Authentication failed.');
  }
  await db.user.update({
    where: { id: user.id },
    data: { otpVerifiedAt: new Date(), otpCodeHash: null, otpAttempts: 0 }
  });
  await writeAudit(request, AuditAction.OtpVerify, {
    entityType: 'User',
    entityId: user.id,
    newSnapshot: { otpVerifiedAt: new Date().toISOString() }
  });
  return await issueSession({ user, request, auditAction: AuditAction.Login });
}

export async function login({ input, request }) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.');
  }
  const { identifier, password } = parsed.data;
  const user = await db.user.findFirst({
    where: { OR: [{ normalizedPhone: normalizePhone(identifier) }, { email: identifier.toLowerCase() }] },
    include: { role: true }
  });
  // Generic 401 whether the user exists or the password is wrong.
  if (!user || !user.active) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication failed.');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication failed.');
  }
  if (env.requireOtpOnLogin && !user.otpVerifiedAt) {
    // FR-02: OTP verification is a mandatory part of the login flow.
    // The citizen must call POST /auth/otp/request to get a code, then
    // POST /auth/otp/verify to complete the session. The mock OTP
    // provider returns the dev code in the response (logged server-side
    // too) for non-production environments.
    throw new AppError(403, 'OTP_REQUIRED', 'OTP verification is required before login. Call POST /auth/otp/request, then POST /auth/otp/verify.');
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit(request, AuditAction.Login, {
    entityType: 'User',
    entityId: user.id,
    newSnapshot: { lastLoginAt: new Date().toISOString() }
  });
  return await issueSession({ user, request, auditAction: null });
}

export async function refresh({ input, request }) {
  const parsed = refreshSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Request body failed validation.');
  }
  let payload;
  try {
    payload = await verifyToken(parsed.data.refreshToken, TOKEN_KIND.REFRESH);
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Authentication failed.');
  }
  const user = await db.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
  if (!user || !user.active) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication failed.');
  }
  // Rotation/revocation path (SECURITY_DESIGN.md).
  if (user.lastRefreshTokenJti && user.lastRefreshTokenJti !== payload.jti) {
    throw new AppError(401, 'INVALID_TOKEN', 'Authentication failed.');
  }
  const access = await issueAccessToken({ user, role: user.role, requestId: request.id });
  const next = await issueRefreshToken({ user, requestId: request.id });
  await db.user.update({
    where: { id: user.id },
    data: { lastRefreshTokenJti: next.jti }
  });
  return {
    user: publicUser(user),
    accessToken: access.token,
    accessTokenExpiresIn: access.expiresIn,
    accessTokenJti: access.jti,
    refreshToken: next.token,
    refreshTokenExpiresIn: next.expiresIn
  };
}

export async function logout({ request }) {
  if (request.user) {
    await db.user.update({
      where: { id: request.user.id },
      data: { lastRefreshTokenJti: null }
    });
    await writeAudit(request, AuditAction.Logout, {
      entityType: 'User',
      entityId: request.user.id
    });
  }
  return { loggedOut: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function issueSession({ user, request, auditAction }) {
  const access = await issueAccessToken({ user, role: user.role, requestId: request.id });
  const refresh = await issueRefreshToken({ user, requestId: request.id });
  await db.user.update({
    where: { id: user.id },
    data: { lastRefreshTokenJti: refresh.jti, ...(auditAction === AuditAction.Login ? { lastLoginAt: new Date() } : {}) }
  });
  if (auditAction) {
    await writeAudit(request, auditAction, {
      entityType: 'User',
      entityId: user.id,
      newSnapshot: { lastLoginAt: new Date().toISOString() }
    });
  }
  return {
    user: publicUser(user),
    accessToken: access.token,
    accessTokenExpiresIn: access.expiresIn,
    accessTokenJti: access.jti,
    refreshToken: refresh.token,
    refreshTokenExpiresIn: refresh.expiresIn
  };
}

export function publicUser(user) {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    email: user.email ?? null,
    role: user.role?.code ?? null,
    preferredLanguage: user.preferredLanguage,
    active: user.active,
    otpVerified: Boolean(user.otpVerifiedAt),
    ownerProfile: user.ownerProfile
      ? {
          id: user.ownerProfile.id,
          fullName: user.ownerProfile.fullName,
          nationalId: user.ownerProfile.nationalId,
          physicalAddress: user.ownerProfile.physicalAddress,
          contactPhone: user.ownerProfile.contactPhone,
          contactEmail: user.ownerProfile.contactEmail
        }
      : null
  };
}
