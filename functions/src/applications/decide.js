import { onCall, HttpsError } from 'firebase-functions/https';
import { SMTP_PASS } from '../lib/config.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { applicationUpdate } from '../lib/templates.js';
import { canTransition, DECISIONS } from '../lib/shared/application-status.js';

const NOTIFY_ON = new Set(['waitlisted', 'rejected', 'info_requested']);

/** Moves an application through the admissions workflow; approval creates the student account. */
export async function decideApplicationCore(deps, { actor, data }) {
  const { repo, audit, provision, mailer, baseUrl, db, FieldValue, log } = deps;

  const applicationId = typeof data?.applicationId === 'string' ? data.applicationId : '';
  const target = DECISIONS[data?.decision];
  const note = typeof data?.note === 'string' ? data.note.trim().slice(0, 500) : '';
  if (!applicationId || !target) throw new HttpsError('invalid-argument', 'Choose an application and a decision.');

  const application = await repo.getById(applicationId);
  if (!application) throw new HttpsError('not-found', 'That application no longer exists.');
  if (!canTransition(application.status, target)) {
    throw new HttpsError('failed-precondition', `An application that is "${application.status}" cannot move to "${target}".`);
  }

  let userId = application.userId ?? null;
  if (target === 'approved') {
    const { applicant } = application;
    const account = await provision({
      email: application.email,
      displayName: `${applicant.firstName} ${applicant.surname}`,
      role: 'student',
      profile: {
        firstName: applicant.firstName,
        middleName: applicant.middleName,
        surname: applicant.surname,
        dateOfBirth: applicant.dateOfBirth,
        gender: applicant.gender,
        phoneNumber: applicant.phoneNumber,
        nationality: applicant.nationality,
        applicationReference: application.reference,
        guardian: application.guardian,
      },
      createdBy: actor.uid,
      applicationId,
    });
    userId = account.uid;

    if (application.programmeId) {
      await db.collection('enrolments').doc(`${userId}_${application.programmeId}`).set({
        studentId: userId,
        programmeId: application.programmeId,
        applicationId,
        status: 'pending_start',
        instructorIds: [],
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  await repo.applyDecision(applicationId, { status: target, note, by: actor.uid, userId });
  await audit({
    actorId: actor.uid,
    action: `application.${data.decision}`,
    resource: { type: 'application', id: applicationId },
    metadata: { reference: application.reference, from: application.status, to: target },
  });

  if (NOTIFY_ON.has(target)) {
    try {
      await mailer.send({
        to: application.email,
        ...applicationUpdate({
          name: application.applicant.firstName, reference: application.reference, status: target, baseUrl,
        }),
      });
    } catch (error) {
      log?.warn('application update email failed', { applicationId, error: String(error) });
    }
  }
  return { status: target, userId };
}

export const decideApplication = onCall({ cors: true, secrets: [SMTP_PASS] }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return decideApplicationCore(deps, { actor, data: request.data });
});
