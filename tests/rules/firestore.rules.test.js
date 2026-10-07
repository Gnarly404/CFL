// Run with: npm run test:rules   (starts the Firestore and Storage emulators; needs Java)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
let env;

const as = {
  anon: () => env.unauthenticatedContext().firestore(),
  student: (uid = 'stu1') => env.authenticatedContext(uid, { role: 'student' }).firestore(),
  instructor: (uid = 'ins1') => env.authenticatedContext(uid, { role: 'instructor' }).firestore(),
  admin: (uid = 'adm1') => env.authenticatedContext(uid, { role: 'admin' }).firestore(),
  noRole: (uid = 'nor1') => env.authenticatedContext(uid, {}).firestore(),
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cfl',
    firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8') },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/stu1'), { uid: 'stu1', role: 'student', status: 'active' });
    await setDoc(doc(db, 'users/stu2'), { uid: 'stu2', role: 'student', status: 'active' });
    await setDoc(doc(db, 'students/stu1'), { uid: 'stu1', profile: {}, preferences: {}, instructorIds: ['ins1'] });
    await setDoc(doc(db, 'programmes/open'), { active: true, title: 'General English' });
    await setDoc(doc(db, 'programmes/hidden'), { active: false, title: 'Draft' });
    await setDoc(doc(db, 'lessons/live'), { published: true, title: 'Greetings' });
    await setDoc(doc(db, 'lessons/draft'), { published: false, title: 'Unfinished' });
    await setDoc(doc(db, 'applications/app1'), { email: 'p@example.com', status: 'submitted' });
    await setDoc(doc(db, 'lessonProgress/stu1_live'), { studentId: 'stu1', lessonId: 'live', percent: 40 });
    await setDoc(doc(db, 'questionAttempts/att1'), { studentId: 'stu1', correct: true });
    await setDoc(doc(db, 'messages/m1'), { senderId: 'ins1', recipientId: 'stu1', body: 'Hello' });
    await setDoc(doc(db, 'notifications/n1'), { userId: 'stu1', title: 'Hi' });
    await setDoc(doc(db, 'payments/p1'), { studentId: 'stu1', amount: 100 });
    await setDoc(doc(db, 'auditLogs/a1'), { action: 'x' });
    await setDoc(doc(db, 'submissions/s1'), { studentId: 'stu1', status: 'draft', content: 'a' });
    await setDoc(doc(db, 'submissions/s2'), { studentId: 'stu1', status: 'submitted', content: 'a' });
    await setDoc(doc(db, 'enrolments/e1'), { studentId: 'stu1', instructorIds: ['ins1'] });
  });
});

describe('identity documents', () => {
  it('people read only their own user document; admins read any; nobody writes', async () => {
    await assertSucceeds(getDoc(doc(as.student('stu1'), 'users/stu1')));
    await assertFails(getDoc(doc(as.student('stu1'), 'users/stu2')));
    await assertFails(getDoc(doc(as.anon(), 'users/stu1')));
    await assertSucceeds(getDoc(doc(as.admin(), 'users/stu1')));
    await assertFails(setDoc(doc(as.student('stu1'), 'users/stu1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as.admin(), 'users/stu1'), { role: 'admin' }));
  });

  it('students edit their profile and preferences but not who teaches them', async () => {
    const ref = doc(as.student('stu1'), 'students/stu1');
    await assertSucceeds(updateDoc(ref, { preferences: { theme: 'dark' } }));
    await assertFails(updateDoc(ref, { instructorIds: [] }));
    await assertFails(getDoc(doc(as.student('stu2'), 'students/stu1')));
  });

  it('an assigned instructor can read the student; an unassigned one cannot', async () => {
    await assertSucceeds(getDoc(doc(as.instructor('ins1'), 'students/stu1')));
    await assertFails(getDoc(doc(as.instructor('ins9'), 'students/stu1')));
  });
});

describe('admissions', () => {
  it('applications are readable by admins only and never writable from a browser', async () => {
    await assertSucceeds(getDoc(doc(as.admin(), 'applications/app1')));
    await assertFails(getDoc(doc(as.student(), 'applications/app1')));
    await assertFails(getDoc(doc(as.anon(), 'applications/app1')));
    await assertFails(setDoc(doc(as.anon(), 'applications/new'), { email: 'x@y.co' }));
    await assertFails(updateDoc(doc(as.admin(), 'applications/app1'), { status: 'approved' }));
  });
});

describe('catalogue and curriculum', () => {
  it('visitors see only active programmes', async () => {
    await assertSucceeds(getDoc(doc(as.anon(), 'programmes/open')));
    await assertFails(getDoc(doc(as.anon(), 'programmes/hidden')));
    await assertSucceeds(getDocs(query(collection(as.anon(), 'programmes'), where('active', '==', true))));
    await assertSucceeds(getDoc(doc(as.admin(), 'programmes/hidden')));
  });

  it('signed-in users read published lessons; drafts are for staff; only admins write', async () => {
    await assertFails(getDoc(doc(as.anon(), 'lessons/live')));
    await assertSucceeds(getDoc(doc(as.student(), 'lessons/live')));
    await assertFails(getDoc(doc(as.student(), 'lessons/draft')));
    await assertSucceeds(getDoc(doc(as.instructor(), 'lessons/draft')));
    await assertFails(setDoc(doc(as.student(), 'lessons/x'), { published: true }));
    await assertFails(setDoc(doc(as.instructor(), 'lessons/x'), { published: true }));
    await assertSucceeds(setDoc(doc(as.admin(), 'lessons/x'), { published: true }));
  });
});

describe('learning state', () => {
  it('students create and update their own progress only', async () => {
    const mine = doc(as.student('stu1'), 'lessonProgress/stu1_new');
    await assertSucceeds(setDoc(mine, { studentId: 'stu1', percent: 10 }));
    await assertFails(setDoc(doc(as.student('stu1'), 'lessonProgress/stu2_new'), { studentId: 'stu2', percent: 10 }));
    await assertSucceeds(updateDoc(doc(as.student('stu1'), 'lessonProgress/stu1_live'), { percent: 80 }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'lessonProgress/stu1_live'), { studentId: 'stu2' }));
    await assertFails(getDoc(doc(as.student('stu2'), 'lessonProgress/stu1_live')));
  });

  it('attempts are append-only', async () => {
    await assertSucceeds(addDoc(collection(as.student('stu1'), 'questionAttempts'), { studentId: 'stu1', correct: false }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'questionAttempts/att1'), { correct: false }));
    await assertFails(deleteDoc(doc(as.student('stu1'), 'questionAttempts/att1')));
  });

  it('accounts without a role cannot write learning data', async () => {
    await assertFails(setDoc(doc(as.noRole('nor1'), 'lessonProgress/nor1_x'), { studentId: 'nor1' }));
  });

  it('a draft submission can be edited and submitted, but not graded by the student', async () => {
    const draft = doc(as.student('stu1'), 'submissions/s1');
    await assertSucceeds(updateDoc(draft, { content: 'better' }));
    await assertSucceeds(updateDoc(draft, { status: 'submitted' }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'submissions/s1'), { grade: 100 }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'submissions/s2'), { content: 'late edit' }));
    await assertFails(setDoc(doc(as.student('stu1'), 'submissions/new'), { studentId: 'stu1', status: 'submitted' }));
  });
});

describe('messages, notifications and money', () => {
  it('only the two participants read a message; the recipient can mark it read; nobody creates one yet', async () => {
    await assertSucceeds(getDoc(doc(as.student('stu1'), 'messages/m1')));
    await assertSucceeds(getDoc(doc(as.instructor('ins1'), 'messages/m1')));
    await assertFails(getDoc(doc(as.student('stu2'), 'messages/m1')));
    await assertSucceeds(updateDoc(doc(as.student('stu1'), 'messages/m1'), { readAt: 1 }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'messages/m1'), { body: 'edited' }));
    await assertFails(addDoc(collection(as.student('stu1'), 'messages'), { senderId: 'stu1', recipientId: 'ins1', body: 'hi' }));
  });

  it('notifications belong to their owner and are created by the server', async () => {
    await assertSucceeds(getDoc(doc(as.student('stu1'), 'notifications/n1')));
    await assertFails(getDoc(doc(as.student('stu2'), 'notifications/n1')));
    await assertSucceeds(updateDoc(doc(as.student('stu1'), 'notifications/n1'), { readAt: 1 }));
    await assertFails(addDoc(collection(as.student('stu1'), 'notifications'), { userId: 'stu1' }));
  });

  it('payments are visible to the payer and admins, and never writable from a browser', async () => {
    await assertSucceeds(getDoc(doc(as.student('stu1'), 'payments/p1')));
    await assertFails(getDoc(doc(as.student('stu2'), 'payments/p1')));
    await assertFails(updateDoc(doc(as.admin(), 'payments/p1'), { amount: 0 }));
  });

  it('audit logs are for admins to read and nobody to write', async () => {
    await assertSucceeds(getDoc(doc(as.admin(), 'auditLogs/a1')));
    await assertFails(getDoc(doc(as.student(), 'auditLogs/a1')));
    await assertFails(addDoc(collection(as.admin(), 'auditLogs'), { action: 'forged' }));
  });
});

describe('everything else is denied', () => {
  it('server-only collections and unknown collections are closed', async () => {
    for (const path of ['counters/applications-2026', 'rateLimits/x', 'secrets/key', 'whatever/doc']) {
      await assertFails(getDoc(doc(as.admin(), path)));
      await assertFails(setDoc(doc(as.admin(), path), { a: 1 }));
    }
  });
});
