import { randomInt } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/https';
import { ENFORCE_APP_CHECK, SMTP_PASS } from '../lib/config.js';
import { buildRuntime } from '../lib/runtime.js';
import { HOUR } from '../lib/rate-limit.js';
import { verificationCodeEmail } from '../lib/templates.js';
import { cleanText, normaliseEmail, validateEmail } from '../lib/shared/validation.js';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFIED_TTL_MS = 30 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

const FAILURE_MESSAGES = {
  missing: 'We could not find a code for this email address. Please request a new code.',
  expired: 'This code has expired. Please request a new code.',
  invalid: 'That verification code is incorrect.',
  'too-many-attempts': 'Too many incorrect attempts. Please request a new code.',
};

/** Storage key for one email address. Hashed, so no raw addresses are used as document ids. */
export const verificationKey = (hash, email) => `verify:${hash(email)}`;
const codeDigest = (hash, email, code) => hash(`code:${email}:${code}`);
const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

function readEmail(data) {
  if (!data || typeof data !== 'object') throw new HttpsError('invalid-argument', 'Send an email address.');
  const problem = validateEmail(data.email);
  if (problem) throw new HttpsError('invalid-argument', problem, { fieldErrors: { email: problem } });
  return normaliseEmail(data.email);
}

/**
 * Pure state transition for one guess. Returns { next, result } so the caller can persist `next`
 * inside a transaction; parallel guesses therefore cannot exceed MAX_ATTEMPTS.
 */
export function applyGuess(record, { digest, nowMs }) {
  if (!record?.codeDigest) return { next: record, result: { ok: false, reason: 'missing' } };
  if (nowMs > record.codeExpiresAt) return { next: record, result: { ok: false, reason: 'expired' } };
  if (record.attempts >= MAX_ATTEMPTS) return { next: record, result: { ok: false, reason: 'too-many-attempts' } };
  const attempts = record.attempts + 1;
  if (digest !== record.codeDigest) return { next: { ...record, attempts }, result: { ok: false, reason: 'invalid' } };
  const verifiedUntil = nowMs + VERIFIED_TTL_MS;
  return {
    next: {
      ...record, attempts, codeDigest: null, verifiedUntil, expiresAt: new Date(verifiedUntil),
    },
    result: { ok: true },
  };
}

/** Emails a six-digit code. The code is generated and stored (hashed) on the server only. */
export async function requestEmailVerificationCore(deps, { data, ip, now = () => new Date() }) {
  const { limiter, verifications, mailer, hash, log } = deps;
  const email = readEmail(data);
  const name = cleanText(data.name).slice(0, 80) || 'there';

  const byIp = await limiter.hit(`verify:ip:${hash(ip ?? 'unknown')}`, { limit: 20, windowMs: HOUR });
  const byEmail = await limiter.hit(`verify:email:${hash(email)}`, { limit: 6, windowMs: HOUR });
  if (!byIp.allowed || !byEmail.allowed) {
    throw new HttpsError('resource-exhausted', 'Too many code requests. Please try again later.', { reason: 'rate-limited' });
  }

  const nowMs = now().getTime();
  const key = verificationKey(hash, email);
  const code = generateCode();
  const fresh = {
    codeDigest: codeDigest(hash, email, code),
    codeExpiresAt: nowMs + CODE_TTL_MS,
    attempts: 0,
    resendAvailableAt: nowMs + RESEND_COOLDOWN_MS,
    verifiedUntil: null,
    expiresAt: new Date(nowMs + CODE_TTL_MS),
  };

  const { next, result } = await verifications.mutate(key, (record) => {
    if (record?.resendAvailableAt > nowMs) {
      return { next: record, result: { ok: false, waitSeconds: Math.ceil((record.resendAvailableAt - nowMs) / 1000) } };
    }
    return { next: fresh, result: { ok: true } };
  });
  if (!result.ok) {
    throw new HttpsError('resource-exhausted', `Please wait ${result.waitSeconds} seconds before asking for another code.`, {
      reason: 'cooldown', retryAfterSeconds: result.waitSeconds,
    });
  }

  try {
    await mailer.send({ to: email, ...verificationCodeEmail({ name, code, minutes: CODE_TTL_MS / 60000 }) });
  } catch (error) {
    // Free the cooldown so the applicant can try again straight away.
    log?.warn('verification email failed', { error: String(error) });
    await verifications.delete(key);
    throw new HttpsError('unavailable', 'We could not send the verification email. Please try again in a moment.');
  }
  return { expiresAt: next.codeExpiresAt, resendAvailableAt: next.resendAvailableAt };
}

/** Checks the code. On success the address stays verified for VERIFIED_TTL_MS or until it is used. */
export async function verifyEmailCodeCore(deps, { data, ip, now = () => new Date() }) {
  const { limiter, verifications, hash } = deps;
  const email = readEmail(data);
  const code = typeof data.code === 'string' ? data.code.trim() : '';
  if (!/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', FAILURE_MESSAGES.invalid, { reason: 'invalid' });
  }

  const byIp = await limiter.hit(`verify-code:ip:${hash(ip ?? 'unknown')}`, { limit: 60, windowMs: HOUR });
  if (!byIp.allowed) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Please try again later.', { reason: 'rate-limited' });
  }

  const nowMs = now().getTime();
  const digest = codeDigest(hash, email, code);
  const { result } = await verifications.mutate(verificationKey(hash, email), (record) => applyGuess(record, { digest, nowMs }));
  if (!result.ok) throw new HttpsError('invalid-argument', FAILURE_MESSAGES[result.reason], { reason: result.reason });
  return { verified: true };
}

/**
 * Called by submitApplication. Atomically uses up a verification, so one code cannot back
 * several applications. Returns the verifiedUntil value so a failed save can be undone.
 */
export async function consumeVerification({ verifications, hash }, email, nowMs) {
  const { result } = await verifications.mutate(verificationKey(hash, email), (record) => {
    if (!record?.verifiedUntil || record.verifiedUntil < nowMs) return { next: record, result: { ok: false } };
    return { next: { ...record, verifiedUntil: null }, result: { ok: true, verifiedUntil: record.verifiedUntil } };
  });
  if (!result.ok) {
    throw new HttpsError('failed-precondition', 'Please verify your email address before sending your application.', {
      reason: 'email-not-verified',
    });
  }
  return result.verifiedUntil;
}

export async function restoreVerification({ verifications, hash }, email, verifiedUntil) {
  await verifications.mutate(verificationKey(hash, email), (record) => ({
    next: record ? { ...record, verifiedUntil } : record,
    result: { ok: true },
  }));
}

export const requestEmailVerification = onCall({ cors: true, enforceAppCheck: ENFORCE_APP_CHECK, secrets: [SMTP_PASS] }, (request) => (
  requestEmailVerificationCore(buildRuntime(), { data: request.data, ip: request.rawRequest?.ip })
));

export const verifyEmailCode = onCall({ cors: true, enforceAppCheck: ENFORCE_APP_CHECK }, (request) => (
  verifyEmailCodeCore(buildRuntime(), { data: request.data, ip: request.rawRequest?.ip })
));
