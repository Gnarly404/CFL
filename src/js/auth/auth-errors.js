import { AppError } from '@/services/errors.js';

const MESSAGES = {
  // One message for every "wrong credentials" case, so the form never reveals which emails have accounts.
  'auth/invalid-credential': "That email and password don't match. Check them and try again.",
  'auth/wrong-password': "That email and password don't match. Check them and try again.",
  'auth/user-not-found': "That email and password don't match. Check them and try again.",
  'auth/invalid-email': 'Enter a valid email address, like name@example.com.',
  'auth/user-disabled': 'This account has been disabled. Contact admissions for help.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or reset your password.',
  'auth/network-request-failed': "We can't reach the server. Check your connection and try again.",
  'auth/expired-action-code': 'This link has expired. Request a new one below.',
  'auth/invalid-action-code': 'This link is invalid or has already been used. Request a new one below.',
  'auth/weak-password': 'Choose a stronger password.',
  'account-not-ready': "Your account isn't set up yet. Contact admissions for help.",
  'account-disabled': 'This account has been disabled. Contact admissions for help.',
};

const FALLBACK = 'Something went wrong. Please try again.';

/** Maps any sign-in or account-link error to a message that is safe and useful to show. */
export function describeAuthError(error) {
  if (error instanceof AppError && !(error.code in MESSAGES)) return error.message || FALLBACK;
  return MESSAGES[error?.code] ?? FALLBACK;
}

export function isExpiredOrInvalidLink(error) {
  return error?.code === 'auth/expired-action-code' || error?.code === 'auth/invalid-action-code';
}
