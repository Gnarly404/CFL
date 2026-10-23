import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { functionsRegion, useEmulators } from '@/core/config.js';
import { firebaseApp } from './firebase-app.js';

let instance = null;

export function functionsService() {
  if (instance) return instance;
  instance = getFunctions(firebaseApp(), functionsRegion);
  if (useEmulators) connectFunctionsEmulator(instance, window.location.hostname, 5173);
  return instance;
}
