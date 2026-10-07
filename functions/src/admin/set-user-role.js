import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { ensureRoleProfile } from '../lib/invite.js';
import { ROLES } from '../lib/shared/roles.js';

/** Change an account's role. Takes effect on the person's next sign-in. */
export async function adminSetUserRoleCore(deps, { actor, data }) {
  const { auth, db, FieldValue, audit } = deps;
  const uid = typeof data?.uid === 'string' ? data.uid : '';
  if (!uid || !ROLES.includes(data?.role)) throw new HttpsError('invalid-argument', 'Choose an account and a role.');
  // Because an admin cannot demote themselves, at least one admin always remains.
  if (uid === actor.uid) throw new HttpsError('failed-precondition', 'You cannot change your own role.');

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That account does not exist.');
  const previous = snap.data();

  await auth.setCustomUserClaims(uid, { role: data.role });
  await auth.revokeRefreshTokens(uid);
  await ref.update({ role: data.role, updatedAt: FieldValue.serverTimestamp() });
  await ensureRoleProfile(deps, {
    uid, email: previous.email, displayName: previous.displayName, role: data.role,
  });
  await audit({
    actorId: actor.uid,
    action: 'user.role',
    resource: { type: 'user', id: uid },
    metadata: { from: previous.role, to: data.role },
  });
  return { uid, role: data.role };
}

export const adminSetUserRole = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminSetUserRoleCore(deps, { actor, data: request.data });
});
