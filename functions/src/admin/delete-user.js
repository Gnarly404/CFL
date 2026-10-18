import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';

export async function adminDeleteUserCore(deps, { actor, data }) {
  const uid = typeof data?.uid === 'string' ? data.uid.trim() : '';
  if (!uid) throw new HttpsError('invalid-argument', 'Choose an account to delete.');
  if (uid === actor.uid) throw new HttpsError('failed-precondition', 'You cannot delete your own account.');

  const { auth, db, audit } = deps;
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'That account does not exist.');

  await auth.deleteUser(uid);
  await Promise.all([
    userRef.delete(),
    db.collection('students').doc(uid).delete(),
    db.collection('instructors').doc(uid).delete(),
    db.collection('studentRecords').doc(uid).delete(),
  ]);
  await audit({
    actorId: actor.uid,
    action: 'user.delete',
    resource: { type: 'user', id: uid },
    metadata: { role: userSnap.data().role, status: userSnap.data().status },
  });
  return { uid, deleted: true };
}

export const adminDeleteUser = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminDeleteUserCore(deps, { actor, data: request.data });
});