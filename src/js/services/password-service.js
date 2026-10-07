import {
  applyActionCode, confirmPasswordReset, sendPasswordResetEmail, verifyPasswordResetCode,
} from 'firebase/auth';
import { ROUTES } from '@/core/routes.js';
import { authService } from './firebase-auth.js';

/** Sends a reset link. Unknown addresses are ignored so the form cannot be used to discover accounts. */
export async function requestPasswordReset(email) {
  try {
    await sendPasswordResetEmail(authService(), email, { url: `${window.location.origin}${ROUTES.login}` });
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
}

/** Checks a reset or invitation code and returns the email it belongs to. */
export function inspectResetCode(oobCode) {
  return verifyPasswordResetCode(authService(), oobCode);
}

export function completePasswordReset(oobCode, newPassword) {
  return confirmPasswordReset(authService(), oobCode, newPassword);
}

export function applyEmailAction(oobCode) {
  return applyActionCode(authService(), oobCode);
}
