import { getApp, getApps, initializeApp } from 'firebase/app';
import { appCheckSiteKey, firebaseConfig, isDevBuild, useEmulators } from '@/core/config.js';
import { startAppCheck } from './app-check.js';

/** One Firebase app per page. Each product (auth, database, functions) lives in its own module so pages load only what they use. */
export function firebaseApp() {
  if (getApps().length) return getApp();
  const app = initializeApp(firebaseConfig);
  // App Check must start before the first callable request. It stays off until a site key is configured.
  startAppCheck(app, { siteKey: appCheckSiteKey, useEmulators, dev: isDevBuild });
  return app;
}
