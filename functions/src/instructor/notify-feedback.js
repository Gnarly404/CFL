import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const SLUG = /^[A-Za-z0-9-]{1,80}$/;

/**
 * Tells a student their teacher left feedback. Browsers cannot create notifications (the rules forbid it), so this
 * runs on the server and checks everything against the database instead of trusting the request:
 * the feedback must exist and be this instructor's, the submission must be submitted, and the instructor must
 * still be assigned to the student. The notification id is derived from the submission, so repeating the call
 * (a retry after a network error, or an edit to the feedback) never creates a second notification.
 */
export async function instructorNotifyFeedbackCore(deps, { actor, data }) {
  const { db, FieldValue, log } = deps;
  const submissionId = typeof data?.submissionId === 'string' ? data.submissionId : '';
  if (!ID.test(submissionId)) throw new HttpsError('invalid-argument', 'Choose a submission.');

  const feedback = await db.collection('feedback').doc(submissionId).get();
  if (!feedback.exists) throw new HttpsError('failed-precondition', 'Save the feedback first.');
  const fb = feedback.data();
  if (fb.instructorId !== actor.uid) throw new HttpsError('permission-denied', 'This feedback is not yours.');

  const submission = await db.collection('submissions').doc(submissionId).get();
  if (!submission.exists || submission.data().status !== 'submitted' || submission.data().studentId !== fb.studentId) {
    throw new HttpsError('failed-precondition', 'That writing is not submitted.');
  }

  const student = await db.collection('students').doc(fb.studentId).get();
  const assigned = student.exists && Array.isArray(student.data().instructorIds) && student.data().instructorIds.includes(actor.uid);
  if (!assigned) throw new HttpsError('permission-denied', 'You are no longer assigned to this student.');

  const { skill, lessonId } = submission.data();
  const link = SLUG.test(skill ?? '') && SLUG.test(lessonId ?? '')
    ? `/student/practice/lesson?skill=${skill}&id=${lessonId}`
    : '/student/practice';

  const teacher = await db.collection('users').doc(actor.uid).get();
  const name = (teacher.exists && typeof teacher.data().displayName === 'string' && teacher.data().displayName.trim()) || 'Your teacher';

  const ref = db.collection('notifications').doc(`feedback_${submissionId}`);
  const created = await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    await tx.set(ref, {
      userId: fb.studentId,
      type: 'feedback',
      category: 'teacher',
      title: 'New feedback on your writing',
      body: `${name} reviewed your writing and left feedback.`,
      link,
      sourceId: submissionId,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
      archivedAt: null,
    });
    return true;
  });
  log?.info?.('feedback notification', { submissionId, created });
  return { created, notificationId: ref.id };
}

export const instructorNotifyFeedback = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['instructor'], deps);
  return instructorNotifyFeedbackCore(deps, { actor, data: request.data });
});
