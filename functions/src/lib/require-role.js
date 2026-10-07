import { HttpsError } from 'firebase-functions/https';

/**
 * Authorises a callable request. The role is read from the live Auth record
 * (not only the ID token, which can be up to an hour old), so demoting or
 * disabling an account takes effect immediately.
 * @returns {Promise<{ uid: string, role: string, email: string|null }>}
 */
export async function requireRole(request, allowedRoles, { auth }) {
  const uid = request?.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');

  let record;
  try {
    record = await auth.getUser(uid);
  } catch {
    throw new HttpsError('unauthenticated', 'Sign in again to continue.');
  }
  if (record.disabled) throw new HttpsError('permission-denied', 'This account is disabled.');

  const role = record.customClaims?.role ?? null;
  if (!allowedRoles.includes(role)) {
    throw new HttpsError('permission-denied', 'You do not have permission to do that.');
  }
  return { uid, role, email: record.email ?? null };
}
