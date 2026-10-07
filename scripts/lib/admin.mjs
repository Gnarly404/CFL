// Loads firebase-admin from functions/node_modules so scripts need no extra install.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve(import.meta.dirname, '../../functions/package.json'));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

export function connect(projectId) {
  if (getApps().length === 0) initializeApp({ projectId });
  return { auth: getAuth(), db: getFirestore(), FieldValue };
}

export function arg(name, argv = process.argv.slice(2)) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
