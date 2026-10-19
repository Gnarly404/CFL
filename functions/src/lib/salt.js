export const MIN_SALT_LENGTH = 16;
const PLACEHOLDER_SALTS = new Set(['cfl', 'cfl-local', 'change-me', 'changeme', 'change-me-to-a-random-string']);

/**
 * Returns the salt used to hash IP addresses and email addresses before they become rate-limit keys.
 * Outside the emulator a missing, short or placeholder value is an error, so a forgotten setting
 * stops the functions loudly instead of quietly running with a guessable salt.
 */
export function resolveSalt(value, { emulator = false } = {}) {
  const salt = typeof value === 'string' ? value.trim() : '';
  if (emulator) return salt || 'cfl-local';
  if (salt.length < MIN_SALT_LENGTH || PLACEHOLDER_SALTS.has(salt.toLowerCase())) {
    throw new Error(
      `IP_HASH_SALT is missing, shorter than ${MIN_SALT_LENGTH} characters, or still a placeholder. `
      + 'Set a random value in functions/.env.<projectId> and redeploy.',
    );
  }
  return salt;
}
