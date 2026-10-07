import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';

/** Disable or re-enable an account. Disabling also signs the person out everywhere. */
export async function adminSetUserStatusCore(deps, { actor, data }) {
  const { auth, db, FieldValue, audit } = deps;
  const uid = typeof data?.uid === 'string' ? data.uid : '';
  if (!uid || typeof data?.disabled !== 'boolean') throw new HttpsError('invalid-argument', 'Choose an account and a status.');
  if (uid === actor.uid) throw new HttpsError('failed-precondition', 'You cannot change your own account status.');

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That account does not exist.');

  await auth.updateUser(uid, { disabled: data.disabled });
  if (data.disabled) await auth.revokeRefreshTokens(uid);

  const status = data.disabled ? 'disabled' : (snap.data().activatedAt ? 'active' : 'invited');
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  await audit({
    actorId: actor.uid,
    action: data.disabled ? 'user.disable' : 'user.enable',
    resource: { type: 'user', id: uid },
    metadata: { status },
  });
  return { uid, status };
}

export const adminSetUserStatus = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminSetUserStatusCore(deps, { actor, data: request.data });
});
