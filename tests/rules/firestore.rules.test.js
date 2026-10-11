// Run with: npm run test:rules   (starts the Firestore and Storage emulators; needs Java)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, Timestamp, updateDoc, where,
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
    await setDoc(doc(db, 'messages/m2'), { threadId: 'stu1_ins1', participants: ['stu1', 'ins1'], studentId: 'stu1', instructorId: 'ins1', senderId: 'ins1', recipientId: 'stu1', body: 'Unit 3 please', createdAt: Timestamp.fromMillis(2_000_000_000_000), readAt: null });
    await setDoc(doc(db, 'notifications/n1'), { userId: 'stu1', title: 'Hi' });
    await setDoc(doc(db, 'payments/p1'), { studentId: 'stu1', amount: 100 });
    await setDoc(doc(db, 'auditLogs/a1'), { action: 'x' });
    await setDoc(doc(db, 'submissions/s1'), { studentId: 'stu1', status: 'draft', content: 'a' });
    await setDoc(doc(db, 'submissions/s2'), { studentId: 'stu1', status: 'submitted', content: 'a' });
    await setDoc(doc(db, 'enrolments/e1'), { studentId: 'stu1', instructorIds: ['ins1'] });
    await setDoc(doc(db, 'enrolments/stu1_open'), { studentId: 'stu1', programmeId: 'open', status: 'pending_start', instructorIds: [] });
    await setDoc(doc(db, 'schedules/c1'), { programmeId: 'open', title: 'Speaking', startsAt: Timestamp.fromMillis(2_000_000_000_000), endsAt: Timestamp.fromMillis(2_000_003_600_000), mode: 'online', status: 'scheduled', instructorId: 'ins1' });
    await setDoc(doc(db, 'schedules/c2'), { programmeId: 'other', title: 'Other course', startsAt: Timestamp.fromMillis(2_000_000_000_000), endsAt: Timestamp.fromMillis(2_000_003_600_000), mode: 'in_person', status: 'scheduled' });
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

  it('practice sessions are append-only and only for yourself', async () => {
    await assertSucceeds(setDoc(doc(as.student('stu1'), 'practiceSessions/stu1_l_1'), { studentId: 'stu1', seconds: 300, date: '2026-10-10' }));
    await assertFails(setDoc(doc(as.student('stu1'), 'practiceSessions/stu2_l_1'), { studentId: 'stu2', seconds: 300, date: '2026-10-10' }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'practiceSessions/stu1_l_1'), { seconds: 3000 }));
    await assertFails(deleteDoc(doc(as.student('stu1'), 'practiceSessions/stu1_l_1')));
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

describe('teacher review of writing', () => {
  const fb = { studentId: 'stu1', submissionId: 's2', instructorId: 'ins1', overall: 'Good start.', notes: [] };

  it('the assigned instructor reads submitted work but not drafts, and an unassigned one reads nothing', async () => {
    await assertSucceeds(getDoc(doc(as.instructor('ins1'), 'submissions/s2')));
    await assertFails(getDoc(doc(as.instructor('ins1'), 'submissions/s1')));
    await assertFails(getDoc(doc(as.instructor('ins2'), 'submissions/s2')));
    await assertSucceeds(getDocs(query(collection(as.instructor('ins1'), 'submissions'), where('studentId', '==', 'stu1'), where('status', '==', 'submitted'))));
    await assertFails(getDocs(query(collection(as.instructor('ins2'), 'submissions'), where('studentId', '==', 'stu1'), where('status', '==', 'submitted'))));
  });

  it('instructors can never change a submission', async () => {
    await assertFails(updateDoc(doc(as.instructor('ins1'), 'submissions/s2'), { content: 'edited' }));
  });

  it('the assigned instructor creates and edits feedback on a submitted piece only', async () => {
    await assertSucceeds(setDoc(doc(as.instructor('ins1'), 'feedback/s2'), fb));
    await assertSucceeds(updateDoc(doc(as.instructor('ins1'), 'feedback/s2'), { overall: 'Better.' }));
    await assertFails(updateDoc(doc(as.instructor('ins1'), 'feedback/s2'), { studentId: 'stu2' }));
    await assertFails(setDoc(doc(as.instructor('ins1'), 'feedback/s1'), { ...fb, submissionId: 's1' }));
    await assertFails(setDoc(doc(as.instructor('ins2'), 'feedback/s2'), { ...fb, instructorId: 'ins2' }));
    await assertFails(setDoc(doc(as.instructor('ins1'), 'feedback/s2'), { ...fb, instructorId: 'ins9' }));
    await assertFails(deleteDoc(doc(as.instructor('ins1'), 'feedback/s2')));
  });

  it('the student reads their own feedback; others and the student cannot write it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'feedback/s2'), fb); });
    await assertSucceeds(getDoc(doc(as.student('stu1'), 'feedback/s2')));
    await assertSucceeds(getDocs(query(collection(as.student('stu1'), 'feedback'), where('studentId', '==', 'stu1'), where('submissionId', '==', 's2'))));
    await assertFails(getDoc(doc(as.student('stu2'), 'feedback/s2')));
    await assertFails(updateDoc(doc(as.student('stu1'), 'feedback/s2'), { overall: 'Perfect!' }));
    await assertSucceeds(getDocs(query(collection(as.instructor('ins1'), 'feedback'), where('instructorId', '==', 'ins1'))));
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

  it('students can mark their notifications read or archived but never change their content', async () => {
    const mine = doc(as.student('stu1'), 'notifications/n1');
    await assertSucceeds(updateDoc(mine, { archivedAt: 2 }));
    await assertSucceeds(updateDoc(mine, { readAt: 3, archivedAt: 3 }));
    await assertFails(updateDoc(mine, { title: 'Changed' }));
    await assertFails(updateDoc(mine, { userId: 'stu2' }));
    await assertFails(updateDoc(mine, { link: 'https://evil.example' }));
    await assertFails(updateDoc(doc(as.student('stu2'), 'notifications/n1'), { readAt: 1 }));
    await assertFails(deleteDoc(mine));
    await assertSucceeds(getDocs(query(collection(as.student('stu1'), 'notifications'), where('userId', '==', 'stu1'))));
    await assertFails(getDocs(query(collection(as.student('stu2'), 'notifications'), where('userId', '==', 'stu1'))));
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

describe('messages between a student and their teacher', () => {
  it('each participant reads their conversation by naming themselves, and nobody else can', async () => {
    const mine = (db, uid) => getDocs(query(collection(db, 'messages'), where('participants', 'array-contains', uid), orderBy('createdAt', 'desc')));
    await assertSucceeds(mine(as.student('stu1'), 'stu1'));
    await assertSucceeds(mine(as.instructor('ins1'), 'ins1'));
    await assertFails(mine(as.student('stu2'), 'stu1'));
    await assertFails(mine(as.instructor('ins2'), 'ins1'));
    await assertFails(getDocs(collection(as.student('stu1'), 'messages')));
    await assertFails(getDoc(doc(as.admin(), 'messages/m2')));
    await assertFails(getDoc(doc(as.anon(), 'messages/m2')));
  });

  it('only the recipient can mark a message read, and nothing else changes', async () => {
    await assertSucceeds(updateDoc(doc(as.student('stu1'), 'messages/m2'), { readAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(as.instructor('ins1'), 'messages/m2'), { readAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'messages/m2'), { body: 'edited' }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'messages/m2'), { readAt: Timestamp.now(), body: 'edited' }));
  });

  it('browsers can never create or delete a message', async () => {
    const m = { threadId: 'stu1_ins1', participants: ['stu1', 'ins1'], senderId: 'stu1', recipientId: 'ins1', body: 'hi' };
    await assertFails(addDoc(collection(as.student('stu1'), 'messages'), m));
    await assertFails(addDoc(collection(as.instructor('ins1'), 'messages'), { ...m, senderId: 'ins1', recipientId: 'stu1' }));
    await assertFails(addDoc(collection(as.admin(), 'messages'), m));
    await assertFails(deleteDoc(doc(as.student('stu1'), 'messages/m2')));
  });
});

describe('class schedule', () => {
  const classDoc = (extra = {}) => ({
    programmeId: 'open', title: 'Grammar', mode: 'in_person', status: 'scheduled',
    startsAt: Timestamp.fromMillis(2_000_000_000_000), endsAt: Timestamp.fromMillis(2_000_003_600_000), ...extra,
  });

  it('an enrolled student reads their programme\'s classes, by naming the programme', async () => {
    await assertSucceeds(getDoc(doc(as.student('stu1'), 'schedules/c1')));
    await assertSucceeds(getDocs(query(collection(as.student('stu1'), 'schedules'), where('programmeId', '==', 'open'), where('startsAt', '>=', Timestamp.fromMillis(0)), orderBy('startsAt'))));
  });

  it('a student cannot read another programme\'s classes, and strangers read nothing', async () => {
    await assertFails(getDoc(doc(as.student('stu1'), 'schedules/c2')));
    await assertFails(getDoc(doc(as.student('stu2'), 'schedules/c1')));
    await assertFails(getDocs(collection(as.student('stu1'), 'schedules')));
    await assertFails(getDoc(doc(as.anon(), 'schedules/c1')));
    await assertFails(getDoc(doc(as.noRole('nor1'), 'schedules/c1')));
  });

  it('the named instructor and admins read; another instructor does not', async () => {
    await assertSucceeds(getDoc(doc(as.instructor('ins1'), 'schedules/c1')));
    await assertSucceeds(getDocs(query(collection(as.instructor('ins1'), 'schedules'), where('instructorId', '==', 'ins1'))));
    await assertFails(getDoc(doc(as.instructor('ins2'), 'schedules/c1')));
    await assertFails(getDoc(doc(as.instructor('ins1'), 'schedules/c2')));
    await assertSucceeds(getDoc(doc(as.admin(), 'schedules/c2')));
  });

  it('only admins write schedule documents directly; instructors schedule through the callable', async () => {
    await assertSucceeds(addDoc(collection(as.admin(), 'schedules'), classDoc()));
    await assertFails(addDoc(collection(as.student('stu1'), 'schedules'), classDoc()));
    await assertFails(addDoc(collection(as.instructor('ins1'), 'schedules'), classDoc({ instructorId: 'ins1' })));
    await assertFails(addDoc(collection(as.instructor('ins1'), 'schedules'), classDoc({ instructorId: 'ins2' })));
    await assertFails(addDoc(collection(as.instructor('ins1'), 'schedules'), classDoc({ instructorId: '' })));
    await assertFails(addDoc(collection(as.admin(), 'schedules'), classDoc({ title: '' })));
    await assertFails(addDoc(collection(as.admin(), 'schedules'), classDoc({ mode: 'moon' })));
    await assertFails(addDoc(collection(as.admin(), 'schedules'), classDoc({ endsAt: Timestamp.fromMillis(1_999_999_000_000) })));
    await assertSucceeds(updateDoc(doc(as.admin(), 'schedules/c1'), { status: 'cancelled' }));
    await assertFails(updateDoc(doc(as.admin(), 'schedules/c1'), { status: 'deleted' }));
    await assertFails(updateDoc(doc(as.instructor('ins1'), 'schedules/c1'), { status: 'cancelled' }));
    await assertFails(updateDoc(doc(as.instructor('ins1'), 'schedules/c1'), { title: 'Changed' }));
    await assertFails(updateDoc(doc(as.instructor('ins2'), 'schedules/c1'), { status: 'cancelled' }));
    await assertFails(updateDoc(doc(as.student('stu1'), 'schedules/c1'), { status: 'cancelled' }));
    await assertFails(deleteDoc(doc(as.instructor('ins1'), 'schedules/c1')));
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
