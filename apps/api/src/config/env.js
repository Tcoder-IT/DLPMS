import 'dotenv/config';

function positivePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 4000;
}

function splitOrigins(value) {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const IS_PROD = process.env.NODE_ENV === 'production';

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: IS_PROD,
  port: positivePort(process.env.API_PORT),
  corsOrigins: splitOrigins(process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174'),
  databaseUrl: process.env.DATABASE_URL ?? null,
  jwtSecret: process.env.JWT_SECRET ?? null,
  // Refresh tokens are stored hashed-by-jti against the users table; rotation/revocation
  // is implemented by clearing User.lastRefreshTokenJti on logout (SECURITY_DESIGN.md).
  accessTokenTtlSeconds: 60 * 15,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  // OTP attempt budget per issued code (SECURITY_DESIGN.md: abuse controls required).
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
  // Optional: when true, OTP is required as a second factor on login.
  // FR-02: "Login using phone number or email with password and OTP verification."
  // OTP is part of the documented login flow. Defaults to required; dev
  // deployments can set REQUIRE_OTP_ON_LOGIN=false to skip the OTP step for
  // faster iteration (the /auth/otp/request + /auth/otp/verify endpoints
  // remain available regardless).
  requireOtpOnLogin: process.env.REQUIRE_OTP_ON_LOGIN !== 'false',
  // Webhook signature validation secret (HMAC-SHA256 over the canonical sorted-key
  // JSON body). MUST be set to a long random value in any non-dev deployment.
  webhookSecret: process.env.WEBHOOK_SECRET ?? null,
  // Public base URL used to build the QR-code verification URL embedded in
  // certificate PDFs. In production this is the externally reachable API URL.
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000'
});
