import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { emulatorHost, useEmulators } from '@/core/config.js';
import { firebaseApp } from './firebase-app.js';

let instance = null;

export function storageService() {
  if (instance) return instance;
  instance = getStorage(firebaseApp());
  if (useEmulators) connectStorageEmulator(instance, emulatorHost, 9199);
  return instance;
}
