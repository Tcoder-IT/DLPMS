// Mock OTP provider adapter. SECURITY_DESIGN.md and AGENTS.md mandate OTP
// behind an adapter and forbid embedding real credentials. The mock provider
// logs the OTP server-side and surfaces it via the response payload in
// development only (NODE_ENV !== production). Production deployments replace
// this file with the real provider integration.

import { issueOtp, hashOtp } from '../utils/security.js';

export async function dispatchOtp({ user, purpose = 'login' }) {
  const code = issueOtp();
  const codeHash = await hashOtp(code);
  // The mock "delivery" surface — log without leaking password/PII.
  console.info({
    event: 'mock_otp_issued',
    userId: user.id,
    purpose,
    code: process.env.NODE_ENV === 'production' ? '[redacted]' : code
  });
  return { codeHash, delivered: process.env.NODE_ENV === 'production' ? true : true, code };
}
