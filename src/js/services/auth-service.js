import {
  browserLocalPersistence, browserSessionPersistence, setPersistence, signInWithEmailAndPassword, signOut,
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
 * Signs in. "Remember me" keeps the session across browser restarts; otherwise it ends with the tab.
 * @returns {Promise<{ user: object, role: string }>}
 */
export async function signIn({ email, password, remember }) {
  const auth = authService();
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const { user } = await signInWithEmailAndPassword(auth, email, password);

  const { claims } = await user.getIdTokenResult();
  const role = normaliseRole(claims.role);
  if (!role) {
    await signOut(auth);
    throw new AppError('account-not-ready', "Your account isn't set up yet. Contact admissions for help.");
  }
  await activateIfNeeded(user);
  return { user, role };
}

