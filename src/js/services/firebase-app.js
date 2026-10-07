import { getApp, getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/core/config.js';

/** One Firebase app per page. Each product (auth, database, functions) lives in its own module so pages load only what they use. */
export function firebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}
