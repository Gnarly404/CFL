import { call } from './callable.js';

/** Asks the server to email a six-digit code. Resolves with { expiresAt, resendAvailableAt } (ms). */
export const requestEmailVerification = ({ email, name }) => call('requestEmailVerification', { email, name });

/** Checks the code on the server. Rejects with an AppError whose details.reason says why. */
export const verifyEmailCode = ({ email, code }) => call('verifyEmailCode', { email, code });
