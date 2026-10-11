import { describe, expect, it, vi } from 'vitest';
import { instructorNotifyFeedbackCore } from '../../functions/src/instructor/notify-feedback.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const actor = { uid: 'ins1', role: 'instructor' };
function env(overrides = {}) {
  const db = fakeDb();
  db.store.set('users/ins1', { role: 'instructor', displayName: 'Ms Otieno' });
  db.store.set('students/stu1', { instructorIds: ['ins1'] });
  db.store.set('submissions/stu1_wf-1', { studentId: 'stu1', status: 'submitted', skill: 'writing', lessonId: 'writing-favourite-place' });
  db.store.set('feedback/stu1_wf-1', { studentId: 'stu1', instructorId: 'ins1', submissionId: 'stu1_wf-1' });
  for (const [key, value] of Object.entries(overrides)) { if (value === null) db.store.delete(key); else db.store.set(key, value); }
  return { db, FieldValue: fakeFieldValue(), log: { info: vi.fn() } };
}
const call = (deps, data = { submissionId: 'stu1_wf-1' }, who = actor) => instructorNotifyFeedbackCore(deps, { actor: who, data });
const code = async (promise) => promise.then(() => null, (e) => e.code);

describe('instructorNotifyFeedback', () => {
  it('creates one notification for the student with a deep link to the writing', async () => {
    const d = env();
    expect(await call(d)).toEqual({ created: true, notificationId: 'feedback_stu1_wf-1' });
    expect(d.db.store.get('notifications/feedback_stu1_wf-1')).toEqual({
      userId: 'stu1', type: 'feedback', category: 'teacher', title: 'New feedback on your writing',
      body: 'Ms Otieno reviewed your writing and left feedback.', link: '/student/practice/lesson?skill=writing&id=writing-favourite-place',
      sourceId: 'stu1_wf-1', createdAt: 'SERVER_TS', readAt: null, archivedAt: null,
    });
  });

  it('is safe to repeat and never resets a notification the student has already read', async () => {
    const d = env();
    await call(d);
    d.db.store.get('notifications/feedback_stu1_wf-1').readAt = 'READ';
    expect(await call(d)).toEqual({ created: false, notificationId: 'feedback_stu1_wf-1' });
    expect(d.db.store.get('notifications/feedback_stu1_wf-1').readAt).toBe('READ');
  });

  it('falls back to a generic name and rejects odd links', async () => {
    const d = env({ 'users/ins1': { role: 'instructor' }, 'submissions/stu1_wf-1': { studentId: 'stu1', status: 'submitted', skill: 'writing', lessonId: '../evil?x=1' } });
    await call(d);
    const n = d.db.store.get('notifications/feedback_stu1_wf-1');
    expect(n.body).toBe('Your teacher reviewed your writing and left feedback.');
    expect(n.link).toBe('/student/practice');
  });

  it('rejects a missing or malformed submission id', async () => {
    const d = env();
    expect(await code(call(d, {}))).toBe('invalid-argument');
    expect(await code(call(d, { submissionId: '../x' }))).toBe('invalid-argument');
    expect(await code(call(d, { submissionId: 5 }))).toBe('invalid-argument');
  });

  it('needs the feedback to exist first', async () => {
    expect(await code(call(env({ 'feedback/stu1_wf-1': null })))).toBe('failed-precondition');
  });

  it('only the instructor who wrote the feedback can trigger it', async () => {
    const d = env();
    expect(await code(call(d, undefined, { uid: 'ins2', role: 'instructor' }))).toBe('permission-denied');
    expect(d.db.store.has('notifications/feedback_stu1_wf-1')).toBe(false);
  });

  it('needs submitted writing that belongs to the same student', async () => {
    expect(await code(call(env({ 'submissions/stu1_wf-1': { studentId: 'stu1', status: 'draft' } })))).toBe('failed-precondition');
    expect(await code(call(env({ 'submissions/stu1_wf-1': { studentId: 'stu2', status: 'submitted' } })))).toBe('failed-precondition');
    expect(await code(call(env({ 'submissions/stu1_wf-1': null })))).toBe('failed-precondition');
  });

  it('refuses when the instructor is no longer assigned', async () => {
    const d = env({ 'students/stu1': { instructorIds: [] } });
    expect(await code(call(d))).toBe('permission-denied');
    expect(d.db.store.has('notifications/feedback_stu1_wf-1')).toBe(false);
    expect(await code(call(env({ 'students/stu1': null })))).toBe('permission-denied');
  });
});
