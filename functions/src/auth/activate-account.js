import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';

/**
 * Called after someone signs in for the first time. Their password only exists because they
 * opened the emailed link, which also proves they own the address, so the account becomes active.
 */
export async function activateAccountCore(deps, { uid }) {
  const { auth, db, FieldValue, audit } = deps;
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Your account is not set up yet. Contact admissions.');

  const { status } = snap.data();
  if (status === 'disabled') throw new HttpsError('permission-denied', 'This account is disabled.');
  if (status !== 'invited') return { status };

  await ref.update({ status: 'active', activatedAt: FieldValue.serverTimestamp() });
  await auth.updateUser(uid, { emailVerified: true });
  await audit({ actorId: uid, action: 'account.activate', resource: { type: 'user', id: uid } });
  return { status: 'active' };
}

export const activateAccount = onCall({ cors: true }, (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return activateAccountCore(buildRuntime(), { uid: request.auth.uid });
});
