import {
  applyActionCode, confirmPasswordReset, verifyPasswordResetCode,
} from 'firebase/auth';
import { authService } from './firebase-auth.js';
import { call } from './callable.js';

/** Requests a quota-limited reset email without disclosing whether the address has an account. */
export async function requestPasswordReset(email) {
  return call('requestPasswordReset', { email });
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
