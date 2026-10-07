/** An error whose message is safe to show to the person using the site. */
export class AppError extends Error {
  constructor(code, message, { fieldErrors = null, cause = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.cause = cause;
  }
}

const GENERIC_MESSAGES = {
  unavailable: "We can't reach the server. Check your connection and try again.",
  'deadline-exceeded': 'That took too long. Check your connection and try again.',
  internal: 'Something went wrong on our side. Please try again in a moment.',
  unknown: 'Something went wrong. Please try again.',
  unauthenticated: 'Sign in to continue.',
};

/** Converts a Firebase callable-function error into an AppError. */
export function fromCallableError(error) {
  if (error instanceof AppError) return error;
  const code = String(error?.code ?? 'unknown').replace(/^functions\//, '');
  const serverMessage = typeof error?.message === 'string' ? error.message : '';
  const message = GENERIC_MESSAGES[code] ?? (serverMessage || GENERIC_MESSAGES.unknown);
  const fieldErrors = error?.details?.fieldErrors ?? null;
  return new AppError(code, message, { fieldErrors, cause: error });
}
