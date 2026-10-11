// Fills the LOCAL emulators with demo accounts and a few applications so you can click through the system.
//   npm run emulators          (terminal 1)
//   npm run seed               (terminal 2)
// Refuses to run unless the emulator environment variables are set, so it can never touch a real project.
import { connect } from './lib/admin.mjs';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: run with the emulators, e.g.\n'
    + '  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed');
  process.exit(1);
}

const { auth, db, FieldValue } = connect('demo-cfl');
const PASSWORD = 'Passw0rd!demo';

const people = [
  { email: 'admin@cfl.test', displayName: 'Ada Admin', role: 'admin' },
  { email: 'instructor@cfl.test', displayName: 'Ian Instructor', role: 'instructor' },
  { email: 'student@cfl.test', displayName: 'Sam Student', role: 'student' },
];

for (const person of people) {
  let user;
  try {
    user = await auth.getUserByEmail(person.email);
    user = await auth.updateUser(user.uid, {
      emailVerified: true,
      displayName: person.displayName,
      password: PASSWORD,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({
      email: person.email, displayName: person.displayName, password: PASSWORD, emailVerified: true,
    });
  }
  await auth.setCustomUserClaims(user.uid, { role: person.role });
  await db.collection('users').doc(user.uid).set({
    uid: user.uid, ...person, status: 'active', createdAt: FieldValue.serverTimestamp(), activatedAt: FieldValue.serverTimestamp(), createdBy: 'seed',
  });
  if (person.role === 'student') {
    await db.collection('students').doc(user.uid).set({
      uid: user.uid, email: person.email, displayName: person.displayName, preferences: {}, instructorIds: [],
      profile: { applicationReference: 'CFL-2026-00000' }, createdAt: FieldValue.serverTimestamp(),
    });
  }
  if (person.role === 'instructor') {
    await db.collection('instructors').doc(user.uid).set({
      uid: user.uid, email: person.email, displayName: person.displayName, bio: '', assignedCourses: [], createdAt: FieldValue.serverTimestamp(),
    });
  }
}

await Promise.all(['seed-1', 'seed-2', 'seed-3'].map((id) => db.collection('applications').doc(id).delete()));

console.log('Seeded demo data. Sign in with any of these (password: %s):', PASSWORD);
for (const person of people) console.log(`  ${person.role.padEnd(10)} ${person.email}`);
