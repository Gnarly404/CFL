import {
  browserSessionPersistence, reload, sendEmailVerification, setPersistence, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { normaliseRole } from '@/auth/session.js';
import { withTimeout } from '@/utils/async.js';
import { authService } from './firebase-auth.js';
import { dbService } from './firebase-db.js';
import { functionsService } from './firebase-functions.js';
import { AppError } from './errors.js';

/** First sign-in after an invitation: ask the server to mark the account active. Never blocks sign-in. */
async function activateIfNeeded(user) {
  try {
    // Never let a slow database hold up sign-in: give it a few seconds, then carry on.
    await withTimeout((async () => {
      const snap = await getDoc(doc(dbService(), 'users', user.uid));
      if (snap.exists() && snap.data().status === 'invited') {
        await httpsCallable(functionsService(), 'activateAccount')();
      }
    })(), 5000);
  } catch (error) {
    console.warn('Could not confirm account activation', error?.code ?? error);
  }
}

/**
 * Signs in with tab-scoped persistence. A copied URL never carries authentication to another tab or browser.
 * @returns {Promise<{ user: object, role: string }>}
 */
export async function signIn({ email, password }) {
  const auth = authService();
  await setPersistence(auth, browserSessionPersistence);
  const { user } = await signInWithEmailAndPassword(auth, email, password);

  try {
    await activateIfNeeded(user);
    await reload(user);
    const { claims } = await user.getIdTokenResult(true);
    const role = normaliseRole(claims.role);
    if (!role) throw new AppError('account-not-ready', "Your account isn't set up yet. Contact admissions for help.");
    if (!user.emailVerified || claims.email_verified !== true) {
      try {
        await sendEmailVerification(user);
      } catch (error) {
        throw new AppError('email-verification-failed', 'We could not send a verification email. Check your connection and try again.', { cause: error });
      }
      throw new AppError('email-not-verified', 'We sent a verification link to your email. Open it, then sign in again.');
    }
    return { user, role };
  } catch (error) {
    if (auth.currentUser?.uid === user.uid) await signOut(auth);
    throw error;
  }
}

