// Provisions explicitly marked test accounts in the production Firebase project.
// Passwords come from the git-ignored .test-accounts.local.json and are stored
// only in Firebase Authentication. Firestore stores roles and profile metadata.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arg, connect } from './lib/admin.mjs';

function reportFailure(error) {
  const message = String(error?.message ?? error ?? 'Unknown error');
  const responseText = String(error?.cause?.response?.text ?? '');
  if (/quota project/i.test(`${message}\n${responseText}`)) {
    console.error('Provisioning failed: Google ADC has no quota project. Set it with:');
    console.error('  gcloud auth application-default set-quota-project <production-project-id>');
  } else {
    console.error(`Provisioning failed: ${message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')}`);
  }
  process.exit(1);
}

// Firebase Admin errors can contain request headers in their stack trace. Keep
// credentials out of console output by reporting only a sanitized summary.
process.on('uncaughtException', reportFailure);
process.on('unhandledRejection', reportFailure);

const root = resolve(import.meta.dirname, '..');
const projectId = arg('project');
const apply = process.argv.includes('--apply');
const environment = readFileSync(resolve(root, '.env.production'), 'utf8');
const productionProjectId = environment.match(/^VITE_FIREBASE_PROJECT_ID=(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
const configPath = resolve(root, '.test-accounts.local.json');

if (!projectId || !productionProjectId || projectId !== productionProjectId || projectId.startsWith('REPLACE_')) {
  console.error('Supply --project matching VITE_FIREBASE_PROJECT_ID in .env.production.');
  process.exit(1);
}
if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to provision production accounts while emulator environment variables are set.');
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch {
  console.error('Missing or invalid .test-accounts.local.json. Create the ignored local account config first.');
  process.exit(1);
}

const accounts = config.accounts;
const roles = new Set(['admin', 'instructor', 'student']);
const emails = new Set();
const passwords = new Set();
if (!Array.isArray(accounts) || accounts.length === 0) {
  throw new Error('The local account config must contain an accounts array.');
}
for (const account of accounts) {
  const email = typeof account.email === 'string' ? account.email.trim().toLowerCase() : '';
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || emails.has(email)) {
    throw new Error('Each test account must have a unique, valid email address.');
  }
  if (!roles.has(account.role) || typeof account.displayName !== 'string' || !account.displayName.trim()) {
    throw new Error(`Test account ${email} must have a display name and a supported role.`);
  }
  if (typeof account.productionPassword !== 'string' || account.productionPassword.length < 20) {
    throw new Error(`Test account ${email} needs a unique productionPassword of at least 20 characters.`);
  }
  if (passwords.has(account.productionPassword)) {
    throw new Error('Each production test account must have a different password.');
  }
  emails.add(email);
  passwords.add(account.productionPassword);
  account.email = email;
}

const { auth, db, FieldValue } = connect(projectId);
const preflight = await Promise.all(accounts.map(async (account) => {
  let user = null;
  try {
    user = await auth.getUserByEmail(account.email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  if (!user) return { account, user: null, userProfile: null };

  const userProfile = await db.collection('users').doc(user.uid).get();
  const data = userProfile.data();
  if (!userProfile.exists || data.testAccount !== true || data.role !== account.role
      || String(data.email ?? '').toLowerCase() !== account.email) {
    throw new Error(`Refusing to modify existing account ${account.email}: it is not a matching account created by this provisioner.`);
  }
  return { account, user, userProfile };
}));

console.log(`Target Firebase project: ${projectId}`);
console.log(`Test accounts: ${accounts.length}; ${preflight.filter((entry) => !entry.user).length} to create; ${preflight.filter((entry) => entry.user).length} already provisioned.`);
for (const { account, user } of preflight) {
  console.log(`${user ? 'UPDATE TEST ACCOUNT' : apply ? 'CREATE' : 'WOULD CREATE'} ${account.role} ${account.email}`);
}
if (!apply) {
  console.log('Dry run only. Add --apply to create/update these marked test accounts.');
  process.exit(0);
}

const createdUsers = [];
let firestoreCommitted = false;
try {
  for (const entry of preflight) {
    const { account } = entry;
    if (entry.user) {
      entry.user = await auth.updateUser(entry.user.uid, {
        password: account.productionPassword,
        displayName: account.displayName,
        emailVerified: true,
        disabled: false,
      });
    } else {
      entry.user = await auth.createUser({
        email: account.email,
        password: account.productionPassword,
        displayName: account.displayName,
        emailVerified: true,
        disabled: false,
      });
      createdUsers.push(entry.user.uid);
    }
    await auth.setCustomUserClaims(entry.user.uid, { role: account.role });
  }

  const batch = db.batch();
  for (const { account, user, userProfile } of preflight) {
    const base = {
      uid: user.uid,
      email: account.email,
      displayName: account.displayName,
      createdAt: FieldValue.serverTimestamp(),
    };
    const userRef = db.collection('users').doc(user.uid);
    if (!userProfile?.exists) {
      batch.create(userRef, {
        ...base,
        role: account.role,
        status: 'active',
        testAccount: true,
        createdBy: 'test-account-provisioner',
        applicationId: null,
        activatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(userRef, {
        email: account.email,
        displayName: account.displayName,
        status: 'active',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (account.role === 'student') {
      const ref = db.collection('students').doc(user.uid);
      if (!(await ref.get()).exists) {
        batch.create(ref, {
          ...base,
          preferences: {},
          instructorIds: [],
          profile: { applicationReference: 'CFL-TEST-00001' },
        });
      }
    }
    if (account.role === 'instructor') {
      const ref = db.collection('instructors').doc(user.uid);
      if (!(await ref.get()).exists) batch.create(ref, { ...base, bio: '', assignedCourses: [] });
    }
  }
  await batch.commit();
  firestoreCommitted = true;

  const verified = await Promise.all(preflight.map(async ({ account, user }) => {
    const roleProfileCollection = account.role === 'student'
      ? 'students' : account.role === 'instructor' ? 'instructors' : null;
    const [authUser, profile, roleProfile] = await Promise.all([
      auth.getUser(user.uid),
      db.collection('users').doc(user.uid).get(),
      roleProfileCollection ? db.collection(roleProfileCollection).doc(user.uid).get() : Promise.resolve(null),
    ]);
    return authUser.emailVerified && authUser.customClaims?.role === account.role
      && !authUser.disabled && profile.exists && profile.data().role === account.role && profile.data().testAccount === true
      && (!roleProfileCollection || roleProfile.exists);
  }));
  if (verified.some((ok) => !ok)) throw new Error('Provisioning completed but verification found an incomplete account.');
  console.log(`Provisioning complete: verified ${verified.length} Auth accounts, role claims, and Firestore user profiles.`);
  console.log('Passwords were set in Firebase Authentication and were not written to Firestore.');
} catch (error) {
  if (!firestoreCommitted) await Promise.allSettled(createdUsers.map((uid) => auth.deleteUser(uid)));
  throw error;
}
