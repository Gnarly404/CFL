const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

export function generateOtp() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);

  return String(array[0] % 1000000).padStart(OTP_LENGTH, '0');
}

export function createOtpSession(email) {
  const code = generateOtp();

  return {
    email,
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    resendAvailableAt: Date.now() + RESEND_COOLDOWN_MS,
  };
}

export function verifyOtp(session, enteredCode) {
  if (!session) {
    return { success: false, reason: 'missing' };
  }

  if (Date.now() > session.expiresAt) {
    return { success: false, reason: 'expired' };
  }

  if (session.attempts >= session.maxAttempts) {
    return { success: false, reason: 'too-many-attempts' };
  }

  session.attempts += 1;

  if (enteredCode !== session.code) {
    return { success: false, reason: 'invalid' };
  }

  return { success: true };
}

export function canResendOtp(session) {
  if (!session) return true;

  return Date.now() >= session.resendAvailableAt;
}

export function refreshOtpSession(session) {
  const newCode = generateOtp();

  return {
    ...session,
    code: newCode,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    resendAvailableAt: Date.now() + RESEND_COOLDOWN_MS,
  };
}

export function getRemainingSeconds(timestamp) {
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}
