import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import {
  MAX_OPEN_REQUESTS, OPEN_SERVICE_STATUSES, validateServiceRequest, validateServiceReview,
} from '../lib/shared/service-request-schema.js';

const invalid = (message, errors) => new HttpsError('invalid-argument', message, errors ? { fieldErrors: errors } : undefined);
const firstMessage = (errors) => Object.values(errors)[0];

/** Records a student's request. The student can read it back; only this function and admins' review change it. */
export async function submitServiceRequestCore(deps, { actor, data }) {
  const { db, FieldValue, audit } = deps;
  const { ok, value, errors } = validateServiceRequest(data);
  if (!ok) throw invalid(firstMessage(errors), errors);

  const mine = await db.collection('serviceRequests').where('studentId', '==', actor.uid).get();
  const open = mine.docs.map((entry) => entry.data()).filter((entry) => OPEN_SERVICE_STATUSES.includes(entry.status));
  if (open.length >= MAX_OPEN_REQUESTS) throw new HttpsError('resource-exhausted', 'You have several requests still open. Wait for the Centre to answer them first.');
  // One open request of a kind, except that a student may apply for several different programmes at once.
  if (open.some((entry) => entry.requestType === value.requestType && (entry.programmeId ?? '') === value.programmeId)) {
    throw new HttpsError('already-exists', 'You already have an open request of this kind. The Centre will reply there, and you can see its status below.');
  }
  if (value.programmeId) {
    const enrolment = await db.collection('enrolments').doc(`${actor.uid}_${value.programmeId}`).get();
    if (enrolment.exists && !['withdrawn', 'completed'].includes(enrolment.data().status)) {
      throw new HttpsError('failed-precondition', 'You are already enrolled in that programme.');
    }
  }

  const [user, student] = await Promise.all([
    db.collection('users').doc(actor.uid).get(),
    db.collection('students').doc(actor.uid).get(),
  ]);
  const ref = db.collection('serviceRequests').doc();
  await ref.set({
    studentId: actor.uid,
    studentEmail: actor.email ?? '',
    studentName: (user.exists && user.data().displayName) || (student.exists && student.data().displayName) || '',
    requestType: value.requestType,
    details: value.details,
    reference: value.reference,
    programmeId: value.programmeId,
    status: 'submitted',
    response: '',
    nextAction: '',
    updates: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await audit?.({
    actorId: actor.uid,
    action: 'service_request.submit',
    resource: { type: 'serviceRequest', id: ref.id },
    metadata: { requestType: value.requestType },
  });
  return { requestId: ref.id, status: 'submitted' };
}

/** An admin's answer: a status, what the student sees, and what they must do next. Keeps a short history. */
export async function adminUpdateServiceRequestCore(deps, { actor, data, now = () => new Date() }) {
  const { db, FieldValue, audit } = deps;
  const requestId = typeof data?.requestId === 'string' ? data.requestId.trim() : '';
  if (!requestId || requestId.length > 150 || requestId.includes('/')) throw invalid('Choose a valid request.');
  const { ok, value, errors, enrol } = validateServiceReview(data);
  if (!ok) throw invalid(firstMessage(errors), errors);

  const ref = db.collection('serviceRequests').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That request could not be found.');
  const request = snap.data();
  const updates = Array.isArray(request.updates) ? request.updates.slice(-19) : [];
  const reviewedAt = now().toISOString();
  await ref.update({
    ...value,
    reviewedBy: actor.uid,
    reviewedAt,
    updatedAt: FieldValue.serverTimestamp(),
    updates: [...updates, { ...value, reviewedBy: actor.uid, reviewedAt }],
  });
  // Completing an application for another programme can enrol the student in it, the same record an approved
  // application creates. An existing enrolment is never overwritten.
  let enrolled = false;
  if (enrol && request.requestType === 'new_programme' && request.programmeId && request.studentId) {
    const enrolmentRef = db.collection('enrolments').doc(`${request.studentId}_${request.programmeId}`);
    const existing = await enrolmentRef.get();
    if (!existing.exists) {
      await enrolmentRef.set({
        studentId: request.studentId,
        programmeId: request.programmeId,
        serviceRequestId: requestId,
        status: 'pending_start',
        instructorIds: [],
        createdAt: FieldValue.serverTimestamp(),
      });
      enrolled = true;
      await audit?.({
        actorId: actor.uid,
        action: 'enrolment.create',
        resource: { type: 'enrolment', id: enrolmentRef.id },
        metadata: { programmeId: request.programmeId, source: 'service_request' },
      });
    }
  }
  await audit?.({
    actorId: actor.uid,
    action: 'service_request.review',
    resource: { type: 'serviceRequest', id: requestId },
    metadata: { status: value.status, requestType: request.requestType },
  });
  return { requestId, status: value.status, enrolled };
}

export const submitServiceRequest = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['student'], deps);
  return submitServiceRequestCore(deps, { actor, data: request.data });
});

export const adminUpdateServiceRequest = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminUpdateServiceRequestCore(deps, { actor, data: request.data });
});
