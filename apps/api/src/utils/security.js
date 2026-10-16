// Identity and security utilities shared by the API.
// Implements the SECURITY_DESIGN.md rules: bcrypt cost factor 12, short-lived
// JWT access tokens (15 minutes), refresh tokens (7 days), generic auth errors,
// and OTP behind an adapter (mock provider for development).

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const BCRYPT_COST = 12;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 15; // 15 minutes (SECURITY_DESIGN.md)
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const TOKEN_KIND = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh'
});

const encoder = new TextEncoder();

function secretKey(secret) {
  if (!secret) {
    throw new Error('JWT secret is not configured. Set JWT_SECRET in .env');
  }
  return encoder.encode(secret);
}

export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function normalizePhone(phone) {
  // RFC3966-ish: keep digits and leading '+'. Used for the unique normalized_phone column.
  if (!phone) return '';
  const trimmed = String(phone).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

export async function issueAccessToken({ user, role, requestId }) {
  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    role: role.code,
    phone: user.phoneNumber,
    lang: user.preferredLanguage ?? 'en',
    jti,
    iat: now,
    typ: TOKEN_KIND.ACCESS,
    rid: requestId ?? null
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(secretKey(process.env.JWT_SECRET));
  return { token, jti, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export async function issueRefreshToken({ user, requestId }) {
  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    typ: TOKEN_KIND.REFRESH,
    jti,
    iat: now,
    rid: requestId ?? null
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_TOKEN_TTL_SECONDS)
    .sign(secretKey(process.env.JWT_SECRET));
  return { token, jti, expiresIn: REFRESH_TOKEN_TTL_SECONDS };
}

export async function verifyToken(token, expectedKind) {
  const { payload } = await jwtVerify(token, secretKey(process.env.JWT_SECRET), {
    algorithms: ['HS256']
  });
  if (expectedKind && payload.typ !== expectedKind) {
    const err = new Error('Invalid token kind');
    err.code = 'INVALID_TOKEN_KIND';
    throw err;
  }
  return payload;
}

// Mock OTP provider — SECURITY_DESIGN.md mandates OTP behind an adapter and
// forbids embedding real credentials. In development the code is returned
// to the caller (logged server-side) for testing only.
export function issueOtp() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  return code;
}

export async function hashOtp(code) {
  return bcrypt.hash(code, 10);
}

export async function verifyOtp(code, hash) {
  return bcrypt.compare(code, hash);
}
