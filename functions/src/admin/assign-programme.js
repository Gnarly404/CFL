import { onCall, HttpsError } from '../lib/secure-call.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';

export const MAX_INSTRUCTORS_PER_PROGRAMME = 20;
const PROGRAMME_ID = /^[a-z0-9_-]{1,100}$/i;

/**
 * Adds or removes an instructor on a programme (many-to-many: an instructor can teach several programmes and a
 * programme can have several instructors). Being on the list is what lets an instructor schedule classes for it,
 * so it changes only here, by an admin, and every change is audited.
 */
export async function adminAssignProgrammeCore(deps, { actor, data }) {
  const { db, FieldValue, audit } = deps;
  const programmeId = typeof data?.programmeId === 'string' ? data.programmeId.trim() : '';
  const instructorId = typeof data?.instructorId === 'string' ? data.instructorId : '';
  if (!PROGRAMME_ID.test(programmeId) || !instructorId || typeof data?.assigned !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Choose a programme, an instructor and whether to assign or remove.');
  }

  if (data.assigned) {
    const instructor = await db.collection('users').doc(instructorId).get();
    if (!instructor.exists || instructor.data().role !== 'instructor') throw new HttpsError('failed-precondition', 'That person is not an instructor.');
    if (instructor.data().status === 'disabled') throw new HttpsError('failed-precondition', 'That instructor’s account is disabled.');
  }

  const ref = db.collection('programmeStaff').doc(programmeId);
  let changed = false;
  const instructorIds = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists && Array.isArray(snap.data().instructorIds) ? snap.data().instructorIds : [];
    const next = data.assigned ? [...new Set([...current, instructorId])] : current.filter((id) => id !== instructorId);
    if (next.length > MAX_INSTRUCTORS_PER_PROGRAMME) {
      throw new HttpsError('failed-precondition', `A programme can have at most ${MAX_INSTRUCTORS_PER_PROGRAMME} instructors.`);
    }
    if (next.length !== current.length) {
      changed = true;
      await tx.set(ref, { programmeId, instructorIds: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return next;
  });

  if (changed) {
    await audit({
      actorId: actor.uid,
      action: data.assigned ? 'programme.assign_instructor' : 'programme.unassign_instructor',
      resource: { type: 'programme', id: programmeId },
      metadata: { instructorId },
    });
  }
  return { programmeId, instructorIds };
}

export const adminAssignProgramme = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminAssignProgrammeCore(deps, { actor, data: request.data });
});
