// Fills the LOCAL emulators with programme and practice content. Test accounts come from an ignored local config file.
//   npm run emulators          (terminal 1)
//   npm run seed               (terminal 2)
// Refuses to run unless the emulator environment variables are set, so it can never touch a real project.
import { existsSync, readFileSync } from 'node:fs';
import { connect } from './lib/admin.mjs';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: run with the emulators, e.g.\n'
    + '  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed');
  process.exit(1);
}

const { auth, db, FieldValue } = connect('demo-cfl');
const accountFile = new URL('../.test-accounts.local.json', import.meta.url);
const accounts = existsSync(accountFile) ? JSON.parse(readFileSync(accountFile, 'utf8')).accounts ?? [] : [];

for (const person of accounts) {
  if (!person.emulatorPassword || !['admin', 'instructor', 'student'].includes(person.role)) {
    throw new Error('The local test account config is incomplete.');
  }
  let user;
  try {
    user = await auth.getUserByEmail(person.email);
    user = await auth.updateUser(user.uid, {
      emailVerified: true, displayName: person.displayName, password: person.emulatorPassword,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({
      email: person.email, displayName: person.displayName, password: person.emulatorPassword, emailVerified: true,
    });
  }
  await auth.setCustomUserClaims(user.uid, { role: person.role });
  await db.collection('users').doc(user.uid).set({
    uid: user.uid, email: person.email, displayName: person.displayName, role: person.role, status: 'active',
    testAccount: true, createdAt: FieldValue.serverTimestamp(), activatedAt: FieldValue.serverTimestamp(), createdBy: 'emulator-seed',
  });
  if (person.role === 'student') {
    await db.collection('students').doc(user.uid).set({
      uid: user.uid, email: person.email, displayName: person.displayName, preferences: {}, instructorIds: [],
      profile: { applicationReference: 'CFL-TEST-00001' }, createdAt: FieldValue.serverTimestamp(),
    });
  }
  if (person.role === 'instructor') {
    await db.collection('instructors').doc(user.uid).set({
      uid: user.uid, email: person.email, displayName: person.displayName, bio: '', assignedCourses: [], createdAt: FieldValue.serverTimestamp(),
    });
  }
}

const demoInstructorAccount = accounts.find((person) => person.role === 'instructor');
const demoInstructor = demoInstructorAccount ? await auth.getUserByEmail(demoInstructorAccount.email) : null;
const programmeList = JSON.parse(readFileSync(new URL('../src/data/programmes.json', import.meta.url), 'utf8'));
const practiceSkills = ['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing'];
await Promise.all(practiceSkills.map(async (skill) => {
  const content = JSON.parse(readFileSync(new URL(`../src/data/practice/${skill}.json`, import.meta.url), 'utf8'));
  await db.collection('practiceContent').doc(skill).set({ ...content, skill });
}));

await Promise.all(programmeList.map((programme) => db.collection('programmes').doc(programme.id).set({
  ...programme, active: true, updatedAt: FieldValue.serverTimestamp(),
}, { merge: true })));
await db.collection('catalogMeta').doc('programmes').set({ deletedIds: [], inactiveIds: [] }, { merge: true });
if (demoInstructor) {
  await Promise.all(programmeList.slice(0, 3).map((programme) => db.collection('programmeStaff').doc(programme.id).set({
    programmeId: programme.id, instructorIds: [demoInstructor.uid], updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })));
}

await Promise.all(['seed-1', 'seed-2', 'seed-3'].map((id) => db.collection('applications').doc(id).delete()));

console.log('Seeded Firestore catalogue and practice curriculum. Local test accounts:', accounts.length);
