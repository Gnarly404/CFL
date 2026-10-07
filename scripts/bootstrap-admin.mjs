// Creates (or promotes) the first administrator, because nobody can approve applications until one exists.
//
//   Local emulators (npm run emulators in another terminal):
//     FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//       node scripts/bootstrap-admin.mjs --project demo-cfl --email you@example.com --name "Your Name"
//
//   Real project (run on your own machine; never commit credentials):
//     gcloud auth application-default login
//     node scripts/bootstrap-admin.mjs --project <your-project-id> --email you@example.com --name "Your Name" \
//       --base-url https://your-domain.example
//
// The script prints a one-time link for choosing a password. Treat it like a password.
import { randomBytes } from 'node:crypto';
import { arg, connect } from './lib/admin.mjs';

const project = arg('project');
const email = arg('email')?.trim().toLowerCase();
const name = arg('name')?.trim();
const baseUrl = arg('base-url') ?? 'http://localhost:5173';

if (!project || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !name || name.length < 2) {
  console.error('Usage: node scripts/bootstrap-admin.mjs --project <id> --email <address> --name "<full name>" [--base-url <site url>]');
  process.exit(1);
}

const { auth, db, FieldValue } = connect(project);

let user;
try {
  user = await auth.getUserByEmail(email);
  console.log(`Found existing account ${user.uid}.`);
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
  user = await auth.createUser({ email, displayName: name, password: randomBytes(24).toString('base64url') });
  console.log(`Created account ${user.uid}.`);
}

await auth.setCustomUserClaims(user.uid, { role: 'admin' });
await auth.revokeRefreshTokens(user.uid);

const ref = db.collection('users').doc(user.uid);
const existing = await ref.get();
if (existing.exists) {
  await ref.set({ role: 'admin', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
} else {
  await ref.set({
    uid: user.uid, email, displayName: user.displayName ?? name, role: 'admin', status: 'invited',
    createdAt: FieldValue.serverTimestamp(), createdBy: 'bootstrap', applicationId: null,
  });
}

const link = await auth.generatePasswordResetLink(email);
const oobCode = new URL(link).searchParams.get('oobCode');
const url = new URL('/activate', baseUrl);
url.searchParams.set('mode', 'resetPassword');
url.searchParams.set('oobCode', oobCode);
url.searchParams.set('invite', '1');

console.log(`\n${email} is now an administrator.`);
console.log('Open this one-time link to choose a password:\n');
console.log(url.toString());
