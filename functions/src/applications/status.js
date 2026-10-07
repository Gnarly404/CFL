import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { HOUR } from '../lib/rate-limit.js';
import { normaliseEmail, validateEmail } from '../lib/shared/validation.js';

const REFERENCE_RE = /^CFL-\d{4}-\d{5}$/;

const toIso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;

/** Lets an applicant check progress with their reference and email. Reveals nothing else. */
export async function getApplicationStatusCore(deps, { data, ip }) {
  const { limiter, repo, hash } = deps;
  const reference = typeof data?.reference === 'string' ? data.reference.trim().toUpperCase() : '';
  const email = normaliseEmail(data?.email);
  if (!REFERENCE_RE.test(reference) || validateEmail(email)) {
    throw new HttpsError('invalid-argument', 'Enter the reference from your confirmation email and the email address you applied with.');
  }

  const byIp = await limiter.hit(`status:ip:${hash(ip ?? 'unknown')}`, { limit: 30, windowMs: HOUR });
  const byReference = await limiter.hit(`status:ref:${hash(reference)}`, { limit: 10, windowMs: HOUR });
  if (!byIp.allowed || !byReference.allowed) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Try again later.');
  }

  const application = await repo.findByReference(reference);
  if (!application || application.email !== email) {
    throw new HttpsError('not-found', 'We could not find an application with those details.');
  }
  return {
    reference,
    status: application.status,
    programmeId: application.programmeId ?? null,
    submittedAt: toIso(application.createdAt),
    updatedAt: toIso(application.updatedAt),
  };
}

export const getApplicationStatus = onCall({ cors: true }, (request) => (
  getApplicationStatusCore(buildRuntime(), { data: request.data, ip: request.rawRequest?.ip })
));
