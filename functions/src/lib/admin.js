import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

/** Lazily initialises the Admin SDK so importing a module never has side effects. */
export function services() {
  if (getApps().length === 0) initializeApp();
  return { auth: getAuth(), db: getFirestore(), FieldValue, Timestamp };
}

export const inEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';
