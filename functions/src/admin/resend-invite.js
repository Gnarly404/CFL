import { onCall, HttpsError } from 'firebase-functions/https';
import { SMTP_PASS } from '../lib/config.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';

/** Sends a fresh activation link to someone who has not activated yet. */
export async function adminResendInviteCore(deps, { actor, data }) {
  const uid = typeof data?.uid === 'string' ? data.uid : '';
  if (!uid) throw new HttpsError('invalid-argument', 'Choose an account.');

  const snap = await deps.db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'That account does not exist.');
  const user = snap.data();
  if (user.status !== 'invited') {
    throw new HttpsError('failed-precondition', 'This person has already activated their account. They can use "Forgot password" to sign in.');
  }

  const result = await deps.provision({
    email: user.email, displayName: user.displayName, role: user.role, createdBy: actor.uid, resendOnly: true,
  });
  await deps.audit({
    actorId: actor.uid, action: 'user.resend_invite', resource: { type: 'user', id: uid }, metadata: {},
  });
  return { uid, ...(deps.exposeLinks && result.activationUrl ? { activationUrl: result.activationUrl } : {}) };
}

export const adminResendInvite = onCall({ cors: true, secrets: [SMTP_PASS] }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return adminResendInviteCore(deps, { actor, data: request.data });
});
