import { onCall, HttpsError } from 'firebase-functions/https';
import { SMTP_PASS } from '../lib/config.js';
import { buildRuntime } from '../lib/runtime.js';
import { DAY, HOUR } from '../lib/rate-limit.js';
import { applicationReceived } from '../lib/templates.js';
import { CONSENT_VERSION, validateApplication } from '../lib/shared/application-schema.js';

/**
 * Stores an admissions application and returns its reference.
 * Dependencies are injected so the policy can be unit-tested without Firebase.
 */
export async function submitApplicationCore(deps, { data, ip, now = () => new Date() }) {
  const { limiter, repo, mailer, baseUrl, hash, log } = deps;

  if (!data || typeof data !== 'object') throw new HttpsError('invalid-argument', 'Send the application details.');

  // Bots fill hidden fields. Answer as if it worked, store nothing.
  if (typeof data.website === 'string' && data.website.trim() !== '') {
    return { reference: 'CFL-0000-00000', status: 'submitted' };
  }

  const { ok, value, errors } = validateApplication(data, { now: now() });
  if (!ok) throw new HttpsError('invalid-argument', 'Check the highlighted fields and try again.', { fieldErrors: errors });

  const byIp = await limiter.hit(`apply:ip:${hash(ip ?? 'unknown')}`, { limit: 10, windowMs: HOUR });
  const byEmail = await limiter.hit(`apply:email:${hash(value.email)}`, { limit: 3, windowMs: DAY });
  if (!byIp.allowed || !byEmail.allowed) {
    throw new HttpsError('resource-exhausted', 'Too many applications from this connection. Try again later or contact admissions.');
  }

  if (await repo.findOpenByEmail(value.email)) {
    throw new HttpsError('already-exists', 'An application for this email address is already in progress. Check your inbox for the confirmation, or contact admissions.');
  }

  const { reference } = await repo.create({
    email: value.email,
    applicantName: `${value.firstName} ${value.surname}`,
    programmeId: value.programmeId,
    applicant: {
      firstName: value.firstName,
      middleName: value.middleName,
      surname: value.surname,
      dateOfBirth: value.dateOfBirth,
      gender: value.gender,
      email: value.email,
      phoneNumber: value.phoneNumber,
      nationality: value.nationality,
    },
    guardian: {
      name: value.guardianName,
      relationship: value.relationship,
      phoneNumber: value.guardianPhone,
      emergencyContact: value.emergencyContact,
    },
    consent: { version: CONSENT_VERSION, acceptedAt: now().toISOString() },
    source: 'web',
  }, now().getUTCFullYear());

  try {
    await mailer.send({ to: value.email, ...applicationReceived({ name: value.firstName, reference, baseUrl }) });
  } catch (error) {
    // The application is saved; a failed email must not make the applicant think it was lost.
    log?.warn('confirmation email failed', { reference, error: String(error) });
  }
  return { reference, status: 'submitted' };
}

export const submitApplication = onCall({ cors: true, secrets: [SMTP_PASS] }, (request) => (
  submitApplicationCore(buildRuntime(), { data: request.data, ip: request.rawRequest?.ip })
));
