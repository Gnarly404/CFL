import { describe, expect, it } from 'vitest';
import { sendScheduleChangeCore } from '../../functions/src/instructor/schedule-notifications.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const scheduleClass = {
  programmeId: 'english-intake', title: 'Grammar workshop',
  startsAt: new Date('2026-10-12T07:00:00.000Z'), endsAt: new Date('2026-10-12T08:00:00.000Z'),
  mode: 'online', location: '', joinLink: 'https://meet.example/class', notes: 'Bring your workbook.',
  instructorId: 'ins1', instructorName: 'Ms Otieno',
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
  return { db, FieldValue: fakeFieldValue() };
}

const messages = (deps) => [...deps.db.store.entries()].filter(([key]) => key.startsWith('messages/')).map(([, value]) => value);
const notifications = (deps) => [...deps.db.store.entries()].filter(([key]) => key.startsWith('notifications/')).map(([key, value]) => ({ id: key.split('/')[1], ...value }));

describe('schedule change notifications', () => {
  it('skips the alert (not the message) for students who switched class reminders off', async () => {
    const deps = setup();
    deps.db.store.set('students/stu1', { preferences: { classReminders: false } });
    const result = await sendScheduleChangeCore(deps, { classId: 'class1', eventId: 'event1', action: 'scheduled', scheduleClass });
    expect(result.sent).toBe(1);
    expect(messages(deps)).toHaveLength(1);
    expect(notifications(deps)).toHaveLength(0);
  });

  it('still alerts students who have no saved preference or left reminders on', async () => {
    const deps = setup();
    deps.db.store.set('students/stu1', { preferences: { classReminders: true, emailUpdates: false } });
    await sendScheduleChangeCore(deps, { classId: 'class1', eventId: 'event1', action: 'scheduled', scheduleClass });
    expect(notifications(deps)).toHaveLength(1);
  });

  it('notifies active enrolled students with the full class details', async () => {
    const deps = setup();
    const result = await sendScheduleChangeCore(deps, { classId: 'class1', eventId: 'event1', action: 'scheduled', scheduleClass });
    expect(result.sent).toBe(1);
    expect(messages(deps)).toHaveLength(1);
    expect(messages(deps)[0]).toMatchObject({
      participants: ['stu1', 'ins1'], kind: 'class_announcement', classId: 'class1',
    });
    expect(messages(deps)[0].body).toContain('New class added to your schedule: Grammar workshop');
    expect(messages(deps)[0].body).toContain('Join link: https://meet.example/class');
    expect(messages(deps)[0].body).toContain('Notes: Bring your workbook.');
    expect(notifications(deps)[0]).toMatchObject({
      id: 'class_class1_stu1', title: 'New class: Grammar workshop', readAt: null, archivedAt: null,
    });
  });

  it('refreshes one unread class notification and sends a message for cancel, restore, and delete', async () => {
    const deps = setup();
    const changes = [['scheduled', 'e1'], ['cancelled', 'e2'], ['restored', 'e3'], ['deleted', 'e4']];
    for (const [index, [action, eventId]] of changes.entries()) {
      await sendScheduleChangeCore(deps, { classId: 'class1', eventId, action, scheduleClass });
      if (index < changes.length - 1) {
        deps.db.store.get('notifications/class_class1_stu1').readAt = 'already read';
        deps.db.store.get('notifications/class_class1_stu1').archivedAt = 'archived';
      }
    }
    const notification = deps.db.store.get('notifications/class_class1_stu1');
    expect(notification.title).toBe('Class removed: Grammar workshop');
    expect(notification.readAt).toBeNull();
    expect(notification.archivedAt).toBeNull();
    expect(messages(deps)).toHaveLength(4);
    expect(messages(deps).map((message) => message.body.split('\n')[0])).toEqual([
      'New class added to your schedule: Grammar workshop',
      'This class has been cancelled and removed from your schedule: Grammar workshop',
      'This class has been restored to your schedule: Grammar workshop',
      'This class has been permanently removed from your schedule: Grammar workshop',
    ]);
  });

  it('does not duplicate a message if the same change event is retried', async () => {
    const deps = setup();
    const event = { classId: 'class1', eventId: 'retry-me', action: 'scheduled', scheduleClass };
    await sendScheduleChangeCore(deps, event);
    await sendScheduleChangeCore(deps, event);
    expect(messages(deps)).toHaveLength(1);
    expect(notifications(deps)).toHaveLength(1);
  });
});