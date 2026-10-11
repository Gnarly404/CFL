import { describe, expect, it } from 'vitest';
import { scheduleClassCore } from '../../functions/src/instructor/schedule-class.js';
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
  it('saves the class and sends its details only to enrolled, enabled students', async () => {
    const deps = setup();
    const result = await scheduleClassCore(deps, { actor, data: input });

    expect(result).toMatchObject({ recipientCount: 1, sent: 1, failed: 0 });
    expect(deps.db.store.get(`schedules/${result.classId}`)).toMatchObject({
      title: 'Grammar workshop', programmeId: 'english-intake', instructorId: 'ins1', status: 'scheduled',
    });
    expect(messages(deps)).toHaveLength(1);
    expect(messages(deps)[0]).toMatchObject({
      participants: ['stu1', 'ins1'], studentId: 'stu1', instructorId: 'ins1',
      senderId: 'ins1', recipientId: 'stu1', kind: 'class_announcement', classId: result.classId,
    });
    expect(messages(deps)[0].body).toContain('Date: Monday, 12 October 2026');
    expect(messages(deps)[0].body).toContain('Time: 10:00 am to 11:00 am EAT');
    expect(messages(deps)[0].body).toContain('Programme: English Intake');
    expect(messages(deps)[0].body).toContain('Join link: https://meet.example/class');
    expect(messages(deps)[0].body).toContain('Notes: Bring your workbook.');
    expect(notifications(deps)).toEqual([expect.objectContaining({
      userId: 'stu1', category: 'class', title: 'New class: Grammar workshop', sourceId: result.classId,
    })]);
  });

  it('rejects unsafe join links before creating a class', async () => {
    const deps = setup();
    await expect(scheduleClassCore(deps, { actor, data: { ...input, joinLink: 'http://example.com/meeting' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect([...deps.db.store.keys()].some((key) => key.startsWith('schedules/'))).toBe(false);
    expect(messages(deps)).toHaveLength(0);
  });

  it('creates the class without fan-out when there are no enrolled students', async () => {
    const deps = setup();
    deps.db.store.delete('enrolments/e1');
    deps.db.store.delete('enrolments/e1-copy');
    deps.db.store.delete('enrolments/e2');
    const result = await scheduleClassCore(deps, { actor, data: input });
    expect(result).toMatchObject({ recipientCount: 0, sent: 0, failed: 0 });
    expect(messages(deps)).toHaveLength(0);
  });
});