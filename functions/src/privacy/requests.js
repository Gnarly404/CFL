import { onCall, HttpsError } from '../lib/secure-call.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';

export const PRIVACY_REQUEST_TYPES = Object.freeze(['data_access', 'correction', 'deletion', 'objection', 'restriction']);
export const PRIVACY_REQUEST_STATUSES = Object.freeze(['submitted', 'under_review', 'needs_student', 'completed', 'declined']);
export const CORRECTION_CATEGORIES = Object.freeze(['legal_identity', 'contact_residence', 'education', 'other']);

const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Accepts a student's request for staff review. Sensitive processing is never performed here. */
export async function submitPrivacyRequestCore(deps, { actor, data }) {
  const { db, FieldValue, audit } = deps;
  const requestType = typeof data?.requestType === 'string' ? data.requestType : '';
  const details = clean(data?.details, 3000);
  const correctionCategory = typeof data?.correctionCategory === 'string' ? data.correctionCategory : '';
  if (!PRIVACY_REQUEST_TYPES.includes(requestType)) throw new HttpsError('invalid-argument', 'Choose a privacy request type.');
  if (requestType !== 'data_access' && details.length < 12) {
    throw new HttpsError('invalid-argument', 'Add a few details so the Centre can review your request.');
  }
  if (requestType === 'correction' && !CORRECTION_CATEGORIES.includes(correctionCategory)) {
    throw new HttpsError('invalid-argument', 'Choose which information needs correction.');
  }

  const ref = db.collection('privacyRequests').doc();
  await ref.set({
    studentId: actor.uid,
    studentEmail: actor.email,
    requestType,
    ...(requestType === 'correction' ? { correctionCategory } : {}),
    details,
    status: 'submitted',
    response: '',
    nextAction: '',
    updates: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await audit?.({
    actorId: actor.uid,
    action: 'privacy_request.submit',
    resource: { type: 'privacyRequest', id: ref.id },
    metadata: { requestType },
  });
  return { requestId: ref.id, status: 'submitted' };
}

/** Records a staff response/status; it does not execute the requested data action. */
export async function adminReviewPrivacyRequestCore(deps, { actor, data, now = () => new Date() }) {
  const { db, FieldValue, audit } = deps;
  const requestId = typeof data?.requestId === 'string' ? data.requestId.trim() : '';
  const status = typeof data?.status === 'string' ? data.status : '';
  const response = clean(data?.response, 3000);
  const nextAction = clean(data?.nextAction, 1000);
  if (!requestId || requestId.length > 150 || !PRIVACY_REQUEST_STATUSES.includes(status) || status === 'submitted') {
    throw new HttpsError('invalid-argument', 'Choose a valid request and review status.');
  }
  if (['needs_student', 'completed', 'declined'].includes(status) && response.length < 3) {
    throw new HttpsError('invalid-argument', 'Add a response before updating this request.');
  }
  if (status === 'needs_student' && nextAction.length < 3) {
    throw new HttpsError('invalid-argument', 'Explain what the student needs to do next.');
  }

  const ref = db.collection('privacyRequests').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That privacy request could not be found.');
  const request = snap.data();
  const updates = Array.isArray(request.updates) ? request.updates.slice(-19) : [];
  const reviewedAt = now().toISOString();
  await ref.update({
    status,
    response,
    nextAction: status === 'needs_student' ? nextAction : '',
    reviewedBy: actor.uid,
    reviewedAt,
    updatedAt: FieldValue.serverTimestamp(),
    updates: [...updates, { status, response, nextAction: status === 'needs_student' ? nextAction : '', reviewedBy: actor.uid, reviewedAt }],
  });
  await audit?.({
    actorId: actor.uid,
    action: 'privacy_request.review',
    resource: { type: 'privacyRequest', id: requestId },
    metadata: { status },
  });
  return { requestId, status };
}

/** Permanently deletes only a declined request. The caller must be an admin. */
export async function adminDeletePrivacyRequestCore(deps, { actor, data }) {
  const { db, audit } = deps;
  const requestId = typeof data?.requestId === 'string' ? data.requestId.trim() : '';
  if (!requestId || requestId.length > 150) throw new HttpsError('invalid-argument', 'Choose a valid privacy request.');
  const ref = db.collection('privacyRequests').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That privacy request could not be found.');
  const request = snap.data();
  if (request.status !== 'declined') throw new HttpsError('failed-precondition', 'Only declined privacy requests can be permanently deleted.');
  await ref.delete();
  await audit?.({
    actorId: actor.uid,
    action: 'privacy_request.delete',
    resource: { type: 'privacyRequest', id: requestId },
    metadata: { requestType: request.requestType, previousStatus: request.status },
  });
  return { requestId, deleted: true };
}

export const submitPrivacyRequest = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['student'], deps);
  return submitPrivacyRequestCore(deps, { actor, data: request.data });
});

export const adminReviewPrivacyRequest = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminReviewPrivacyRequestCore(deps, { actor, data: request.data });
});

export const adminDeletePrivacyRequest = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminDeletePrivacyRequestCore(deps, { actor, data: request.data });
});