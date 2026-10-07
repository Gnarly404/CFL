import { signOut } from 'firebase/auth';
import { authService } from '@/services/firebase-auth.js';
import { isRole } from '@/utils/roles.js';

export function normaliseRole(value) {
  return isRole(value) ? value : null;
}

/**
 * Resolves once Firebase has restored any saved sign-in.
 * The role comes from the server-set custom claim in the ID token.
 * @returns {Promise<{ user: import('firebase/auth').User|null, role: string|null }>}
 */
export async function currentSession() {
  const auth = authService();

  const user = await new Promise((resolve, reject) => {
    const unsubscribe = auth.onAuthStateChanged((nextUser) => {
      resolve(nextUser);
      unsubscribe();
    }, reject);
  });

  if (!user) return { user: null, role: null };
  const { claims } = await user.getIdTokenResult();
  return { user, role: normaliseRole(claims.role) };
}

export async function signOutUser() {
  await signOut(authService());
}
