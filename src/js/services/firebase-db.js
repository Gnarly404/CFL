import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { emulatorHost, useEmulators } from '@/core/config.js';
import { firebaseApp } from './firebase-app.js';

let instance = null;

export function dbService() {
  if (instance) return instance;
  instance = getFirestore(firebaseApp());
  if (useEmulators) connectFirestoreEmulator(instance, emulatorHost, 8080);
  return instance;
}
