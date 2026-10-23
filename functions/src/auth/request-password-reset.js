import { onCall, HttpsError } from '../lib/secure-call.js';
import { SMTP_PASS } from '../lib/config.js';
import { buildRuntime } from '../lib/runtime.js';
import { DAY } from '../lib/rate-limit.js';
import { passwordReset } from '../lib/templates.js';
import { normaliseEmail, validateEmail } from '../lib/shared/validation.js';

const COOLDOWN = 15 * 60 * 1000;
const EMAIL_DAY_LIMIT = { limit: 5, windowMs: DAY };
const ALERT_COOLDOWN = { limit: 1, windowMs: 5 * 60 * 1000 };
const GENERIC_RESPONSE = { accepted: true };

export async function requestPasswordResetCore(deps, { data }) {
  const email = normaliseEmail(data?.email);
  if (validateEmail(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.');

  const cooldown = await deps.limiter.hit(`reset:cooldown:${deps.hash(email)}`, { limit: 1, windowMs: COOLDOWN });
  const dailyQuota = await deps.limiter.hit(`reset:daily:${deps.hash(email)}`, EMAIL_DAY_LIMIT);
  if (!cooldown.allowed || !dailyQuota.allowed) {
    const shouldLog = await deps.limiter.hit(`reset:alert:${deps.hash(email)}`, ALERT_COOLDOWN);
    if (shouldLog.allowed) {
      deps.log.warn('password reset quota exceeded', {
        event: 'security.rate_limit',
        functionName: 'requestPasswordReset',
        dimension: 'email',
        principal: deps.hash(email),
      });
    }
    throw new HttpsError('resource-exhausted', 'Too many reset requests. Please wait before trying again.');
  }

  let user;
  try {
    user = await deps.auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return GENERIC_RESPONSE;
    throw error;
  }

  try {
    const actionUrl = await deps.auth.generatePasswordResetLink(email, {
      url: new URL('/activate', deps.baseUrl).toString(),
    });
    await deps.mailer.send({ to: email, ...passwordReset({ name: user.displayName || 'there', actionUrl }) });
  } catch (error) {
    deps.log.error('password reset email failed', {
      event: 'security.password_reset_email_failure',
      recipient: deps.hash(email),
      error: String(error),
    });
  }
  return GENERIC_RESPONSE;
}

export const requestPasswordReset = onCall(
  { cors: true, secrets: [SMTP_PASS] },
  (request) => requestPasswordResetCore(buildRuntime(), { data: request.data }),
);
