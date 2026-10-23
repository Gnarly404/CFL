import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { appCheckSiteKey, firebaseConfig, useEmulators } from '@/core/config.js';

let appCheckInitialized = false;

/** One Firebase app per page. Each product (auth, database, functions) lives in its own module so pages load only what they use. */
export function firebaseApp() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  if (!appCheckInitialized && appCheckSiteKey && !useEmulators) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  }
  return app;
}
