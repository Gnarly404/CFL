import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

/**
 * Turns on Firebase App Check for a Firebase app when a reCAPTCHA Enterprise site key is configured.
 * With no key (the default) or against the local emulators, nothing happens, so pages work exactly as before.
 * Once initialised, the Functions SDK attaches an App Check token to every callable request on its own.
 *
 * The collaborators are injectable so the decision can be tested without a browser.
 */
export function startAppCheck(app, {
  siteKey = '',
  useEmulators = false,
  dev = false,
  init = initializeAppCheck,
  Provider = ReCaptchaEnterpriseProvider,
  scope = globalThis,
} = {}) {
  const key = typeof siteKey === 'string' ? siteKey.trim() : '';
  if (!key || useEmulators) return null;
  // On a developer's machine, ask the SDK to print a debug token to register in the Firebase console,
  // instead of running the real reCAPTCHA check against localhost.
  if (dev) scope.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  return init(app, { provider: new Provider(key), isTokenAutoRefreshEnabled: true });
}
