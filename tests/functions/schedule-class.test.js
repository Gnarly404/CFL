import { describe, expect, it } from 'vitest';
import { manageScheduledClassCore, scheduleClassCore } from '../../functions/src/instructor/schedule-class.js';
import { fakeDb, fakeFieldValue, log } from './helpers/fakes.js';

const actor = { uid: 'ins1', role: 'instructor', email: 'teacher@example.com' };
const input = {
  programmeId: 'english-intake',
  title: 'Grammar workshop',
  startsAt: '2026-10-12T07:00:00.000Z',
  endsAt: '2026-10-12T08:00:00.000Z',
  mode: 'online',
  location: '',
  joinLink: 'https://meet.example/class',
  notes: 'Bring your workbook.',
};

function setup() {
  const db = fakeDb();
  db.store.set('users/ins1', { role: 'instructor', status: 'active', displayName: 'Ms Otieno' });
  db.store.set('users/stu1', { role: 'student', status: 'active', displayName: 'Amina K' });
  db.store.set('users/stu2', { role: 'student', status: 'disabled', displayName: 'Disabled Student' });
  db.store.set('users/stu3', { role: 'student', status: 'active', displayName: 'Other Programme Student' });
  db.store.set('enrolments/e1', { studentId: 'stu1', programmeId: 'english-intake' });
  db.store.set('enrolments/e1-copy', { studentId: 'stu1', programmeId: 'english-intake' });
  db.store.set('enrolments/e2', { studentId: 'stu2', programmeId: 'english-intake' });
  db.store.set('enrolments/e3', { studentId: 'stu3', programmeId: 'maths' });
  return { db, FieldValue: fakeFieldValue(), log: log() };
}

const messages = (deps) => [...deps.db.store.entries()].filter(([key]) => key.startsWith('messages/')).map(([, value]) => value);
const notifications = (deps) => [...deps.db.store.entries()].filter(([key]) => key.startsWith('notifications/')).map(([, value]) => value);

describe('scheduleClass', () => {
  it('returns after creating the class without waiting for student notifications', async () => {
    const deps = setup();
    const result = await scheduleClassCore(deps, { actor, data: input });

    expect(result.classId).toBeTruthy();
    expect(deps.db.store.get(`schedules/${result.classId}`)).toMatchObject({
      title: 'Grammar workshop', programmeId: 'english-intake', instructorId: 'ins1', status: 'scheduled',
    });
    expect(messages(deps)).toHaveLength(0);
    expect(notifications(deps)).toHaveLength(0);
  });

  it('rejects unsafe join links before creating a class', async () => {
    const deps = setup();
    await expect(scheduleClassCore(deps, { actor, data: { ...input, joinLink: 'http://example.com/meeting' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect([...deps.db.store.keys()].some((key) => key.startsWith('schedules/'))).toBe(false);
    expect(messages(deps)).toHaveLength(0);
  });

  it('rejects a class that overlaps another active class for the instructor', async () => {
    const deps = setup();
    deps.db.store.set('schedules/existing', {
      instructorId: 'ins1', status: 'scheduled',
      startsAt: new Date('2026-10-12T07:30:00.000Z'),
      endsAt: new Date('2026-10-12T08:30:00.000Z'),
    });
    await expect(scheduleClassCore(deps, { actor, data: input })).rejects.toMatchObject({ code: 'already-exists' });
    expect([...deps.db.store.keys()].filter((key) => key.startsWith('schedules/'))).toHaveLength(1);
  });

  it('allows a new class when the apparent overlap was cancelled', async () => {
    const deps = setup();
    deps.db.store.set('schedules/cancelled', {
      instructorId: 'ins1', status: 'cancelled',
      startsAt: new Date('2026-10-12T07:30:00.000Z'),
      endsAt: new Date('2026-10-12T08:30:00.000Z'),
    });
    const result = await scheduleClassCore(deps, { actor, data: input });
    expect(result.classId).toBeTruthy();
  });

  it('cancels, restores, and permanently deletes only the instructor’s own class', async () => {
    const deps = setup();
    deps.db.store.set('schedules/owned', { instructorId: 'ins1', status: 'scheduled' });
    deps.db.store.set('schedules/other', { instructorId: 'ins2', status: 'scheduled' });
    await manageScheduledClassCore(deps, { actor, data: { classId: 'owned', action: 'cancel' } });
    expect(deps.db.store.get('schedules/owned').status).toBe('cancelled');
    await manageScheduledClassCore(deps, { actor, data: { classId: 'owned', action: 'restore' } });
    expect(deps.db.store.get('schedules/owned').status).toBe('scheduled');
    await expect(manageScheduledClassCore(deps, { actor, data: { classId: 'other', action: 'delete' } }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await manageScheduledClassCore(deps, { actor, data: { classId: 'owned', action: 'delete' } });
    expect(deps.db.store.has('schedules/owned')).toBe(false);
  });
});