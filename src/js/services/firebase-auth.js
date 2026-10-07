import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { emulatorHost, useEmulators } from '@/core/config.js';
import { firebaseApp } from './firebase-app.js';

let instance = null;

export function authService() {
  if (instance) return instance;
  instance = getAuth(firebaseApp());
  if (useEmulators) connectAuthEmulator(instance, `http://${emulatorHost}:9099`, { disableWarnings: true });
  return instance;
}
