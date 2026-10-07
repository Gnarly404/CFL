// Run with: npm run test:rules
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
let env;
const png = { contentType: 'image/png' };
const bytes = (n) => new Uint8Array(n);

const as = {
  anon: () => env.unauthenticatedContext().storage(),
  student: (uid = 'stu1') => env.authenticatedContext(uid, { role: 'student' }).storage(),
  instructor: (uid = 'ins1') => env.authenticatedContext(uid, { role: 'instructor' }).storage(),
  admin: (uid = 'adm1') => env.authenticatedContext(uid, { role: 'admin' }).storage(),
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cfl',
    storage: { rules: readFileSync(resolve(root, 'storage.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = ctx.storage();
    await uploadBytes(ref(s, 'public/brochure.pdf'), bytes(10), { contentType: 'application/pdf' });
    await uploadBytes(ref(s, 'submissions/stu1/essay.pdf'), bytes(10), { contentType: 'application/pdf' });
    await uploadBytes(ref(s, 'content/lesson1.mp3'), bytes(10), { contentType: 'audio/mpeg' });
  });
});
afterAll(async () => { await env?.cleanup(); });

describe('storage rules', () => {
  it('public files are world-readable but only admins can upload', async () => {
    await assertSucceeds(getBytes(ref(as.anon(), 'public/brochure.pdf')));
    await assertFails(uploadBytes(ref(as.student(), 'public/x.png'), bytes(10), png));
    await assertSucceeds(uploadBytes(ref(as.admin(), 'public/x.png'), bytes(10), png));
  });

  it('avatars: owner uploads small images only', async () => {
    await assertSucceeds(uploadBytes(ref(as.student('stu1'), 'users/stu1/avatar/me.png'), bytes(100), png));
    await assertFails(uploadBytes(ref(as.student('stu1'), 'users/stu2/avatar/me.png'), bytes(100), png));
    await assertFails(uploadBytes(ref(as.student('stu1'), 'users/stu1/avatar/me.png'), bytes(3 * 1024 * 1024), png));
    await assertFails(uploadBytes(ref(as.student('stu1'), 'users/stu1/avatar/me.exe'), bytes(100), { contentType: 'application/x-msdownload' }));
  });

  it('submissions are private to the student and staff', async () => {
    await assertSucceeds(getBytes(ref(as.student('stu1'), 'submissions/stu1/essay.pdf')));
    await assertSucceeds(getBytes(ref(as.instructor(), 'submissions/stu1/essay.pdf')));
    await assertFails(getBytes(ref(as.student('stu2'), 'submissions/stu1/essay.pdf')));
    await assertFails(getBytes(ref(as.anon(), 'submissions/stu1/essay.pdf')));
    await assertSucceeds(uploadBytes(ref(as.student('stu1'), 'submissions/stu1/talk.mp3'), bytes(100), { contentType: 'audio/mpeg' }));
    await assertFails(uploadBytes(ref(as.student('stu1'), 'submissions/stu1/run.js'), bytes(100), { contentType: 'text/javascript' }));
  });

  it('learning content needs sign-in to read and an admin to change', async () => {
    await assertFails(getBytes(ref(as.anon(), 'content/lesson1.mp3')));
    await assertSucceeds(getBytes(ref(as.student(), 'content/lesson1.mp3')));
    await assertFails(uploadBytes(ref(as.student(), 'content/new.mp3'), bytes(10), { contentType: 'audio/mpeg' }));
    await assertSucceeds(uploadBytes(ref(as.admin(), 'content/new.mp3'), bytes(10), { contentType: 'audio/mpeg' }));
  });

  it('everything else is closed', async () => {
    await assertFails(getBytes(ref(as.admin(), 'misc/file.txt')));
    await assertFails(uploadBytes(ref(as.admin(), 'misc/file.txt'), bytes(10), { contentType: 'text/plain' }));
  });
});
