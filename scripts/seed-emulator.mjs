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
  } catch {
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

const applicants = [
  ['Wanjiku', 'Kamau', 'wanjiku.parent@example.com', 'submitted'],
  ['Otieno', 'Odhiambo', 'otieno.parent@example.com', 'under_review'],
  ['Amina', 'Hassan', 'amina.parent@example.com', 'waitlisted'],
];
let n = 0;
for (const [firstName, surname, email, status] of applicants) {
  n += 1;
  await db.collection('applications').doc(`seed-${n}`).set({
    reference: `CFL-2026-9000${n}`, status, email, applicantName: `${firstName} ${surname}`, programmeId: null, userId: null,
    applicant: {
      firstName, middleName: '', surname, dateOfBirth: '2012-05-14', gender: 'other', email, phoneNumber: '+254712345678', nationality: 'kenyan',
    },
    guardian: { name: 'Guardian Example', relationship: 'parent', phoneNumber: '+254722000111', emergencyContact: 'Contact Example' },
    consent: { version: '2026-10', acceptedAt: new Date().toISOString() }, source: 'seed',
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    statusHistory: [{ status, at: new Date(), by: 'seed' }],
  });
}

console.log('Seeded demo data. Sign in with any of these (password: %s):', PASSWORD);
for (const person of people) console.log(`  ${person.role.padEnd(10)} ${person.email}`);
