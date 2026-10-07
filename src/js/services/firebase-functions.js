import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { emulatorHost, functionsRegion, useEmulators } from '@/core/config.js';
import { firebaseApp } from './firebase-app.js';

let instance = null;

export function functionsService() {
  if (instance) return instance;
  instance = getFunctions(firebaseApp(), functionsRegion);
  if (useEmulators) connectFunctionsEmulator(instance, emulatorHost, 5001);
  return instance;
}
