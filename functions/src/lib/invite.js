import { randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/https';
import { accountInvite } from './templates.js';

export function randomPassword() {
  return randomBytes(24).toString('base64url');
}

/**
 * Turns the link Firebase generates into one that opens our own /activate page.
 * Only the one-time oobCode is kept, so the flow works without customising Firebase's email action URL.
 */
export function buildActivationUrl(firebaseLink, baseUrl) {
  const oobCode = new URL(firebaseLink).searchParams.get('oobCode');
  if (!oobCode) throw new Error('Firebase did not return an action code.');
  const url = new URL('/activate', baseUrl);
  url.searchParams.set('mode', 'resetPassword');
  url.searchParams.set('oobCode', oobCode);
  url.searchParams.set('invite', '1');
  return url.toString();
}

async function createIfMissing(ref, data) {
  const snap = await ref.get();
  if (!snap.exists) await ref.set(data);
}

/** Creates the role-specific profile document once; later calls never overwrite it. */
export async function ensureRoleProfile({ db, FieldValue }, { uid, email, displayName, role, profile }) {
  const base = { uid, email, displayName, createdAt: FieldValue.serverTimestamp() };
  if (role === 'student') {
    await createIfMissing(db.collection('students').doc(uid), { ...base, profile: profile ?? {}, preferences: {}, instructorIds: [] });
  } else if (role === 'instructor') {
    await createIfMissing(db.collection('instructors').doc(uid), { ...base, bio: '', assignedCourses: [] });
  }
}

/**
 * Creates (or finds) an account, sets its role claim, writes its user document and emails an activation link.
 * Safe to repeat: existing profile data is never overwritten and active accounts are not re-invited.
 */
export async function provisionAccount(deps, {
  email, displayName, role, profile = null, createdBy, applicationId = null, resendOnly = false,
}) {
  const {
    auth, db, FieldValue, mailer, baseUrl, log,
  } = deps;

  let user = null;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  if (!user && resendOnly) throw new HttpsError('not-found', 'No account exists for that email address.');
  if (user) {
    const existingRole = user.customClaims?.role;
    if (existingRole && existingRole !== role) {
      throw new HttpsError('already-exists', 'An account with this email address already exists with a different role.');
    }
  } else {
    user = await auth.createUser({
      email, displayName, password: randomPassword(), emailVerified: false, disabled: false,
    });
  }

  const { uid } = user;
  await auth.setCustomUserClaims(uid, { role });

  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();
  if (!existing.exists) {
    await userRef.set({
      uid, email, displayName, role, status: 'invited', createdAt: FieldValue.serverTimestamp(), createdBy, applicationId,
    });
  }
  await ensureRoleProfile(deps, { uid, email, displayName, role, profile });

  if (existing.exists && existing.data().status === 'active') return { uid, activationUrl: null, invited: false };
  if (existing.exists && existing.data().status === 'disabled') {
    throw new HttpsError('failed-precondition', 'This account is disabled. Enable it before sending an invitation.');
  }

  const link = await auth.generatePasswordResetLink(email, { url: new URL('/login', baseUrl).toString() });
  const activationUrl = buildActivationUrl(link, baseUrl);
  try {
    await mailer.send({ to: email, ...accountInvite({ name: displayName, activationUrl, role }) });
  } catch (error) {
    // The account and its link already exist, so say so: the admin can fix the email settings and resend.
    // Log the failure's code and response (never the password or the link) so the cause can be found.
    log?.error?.('invitation email failed', {
      code: error?.code, responseCode: error?.responseCode, command: error?.command, message: String(error?.message ?? error).slice(0, 300),
    });
    throw new HttpsError('failed-precondition', 'The account was created, but the invitation email could not be sent. Check the server\'s email settings, then use "Resend invitation".', { accountCreated: true, uid });
  }
  // `emailed: false` means the server only logged the message (its mail setting is "console"), so nobody received it.
  return { uid, activationUrl, invited: true, ...(mailer.mode === 'console' ? { emailed: false } : {}) };
}
