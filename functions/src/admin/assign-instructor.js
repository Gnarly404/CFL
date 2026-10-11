import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';

export const MAX_INSTRUCTORS_PER_STUDENT = 5;

/**
 * Adds or removes an instructor on a student's record. That list is what lets an instructor read the student's
 * submitted writing, so it changes only here, by an admin, and every change is audited.
 */
export async function adminAssignInstructorCore(deps, { actor, data }) {
  const { db, FieldValue, audit } = deps;
  const studentId = typeof data?.studentId === 'string' ? data.studentId : '';
  const instructorId = typeof data?.instructorId === 'string' ? data.instructorId : '';
  if (!studentId || !instructorId || typeof data?.assigned !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Choose a student, an instructor and whether to assign or remove.');
  }

  if (data.assigned) {
    const instructor = await db.collection('users').doc(instructorId).get();
    if (!instructor.exists || instructor.data().role !== 'instructor') throw new HttpsError('failed-precondition', 'That person is not an instructor.');
    if (instructor.data().status === 'disabled') throw new HttpsError('failed-precondition', 'That instructor’s account is disabled.');
  }

  const ref = db.collection('students').doc(studentId);
  const instructorIds = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That student does not exist.');
    const current = Array.isArray(snap.data().instructorIds) ? snap.data().instructorIds : [];
    const next = data.assigned ? [...new Set([...current, instructorId])] : current.filter((id) => id !== instructorId);
    if (next.length > MAX_INSTRUCTORS_PER_STUDENT) {
      throw new HttpsError('failed-precondition', `A student can have at most ${MAX_INSTRUCTORS_PER_STUDENT} instructors.`);
    }
    if (next.length !== current.length) await tx.update(ref, { instructorIds: next, updatedAt: FieldValue.serverTimestamp() });
    return next;
  });

  await audit({
    actorId: actor.uid,
    action: data.assigned ? 'student.assign_instructor' : 'student.unassign_instructor',
    resource: { type: 'student', id: studentId },
    metadata: { instructorId },
  });
  return { studentId, instructorIds };
}

export const adminAssignInstructor = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminAssignInstructorCore(deps, { actor, data: request.data });
});
