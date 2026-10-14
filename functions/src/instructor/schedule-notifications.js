import { createHash } from 'node:crypto';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { services } from '../lib/admin.js';

const RECIPIENTS_PER_BATCH = 200;
const programmeLabel = (id) => String(id ?? 'Programme')
  .split(/[-_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

function actionFor(before, after) {
  if (!before && after?.status === 'scheduled') return 'scheduled';
  if (before && !after) return 'deleted';
  if (before?.status === 'scheduled' && after?.status === 'cancelled') return 'cancelled';
  if (before?.status === 'cancelled' && after?.status === 'scheduled') return 'restored';
  return null;
}

function announcementBody(scheduleClass, action, instructorName) {
  const startsAt = scheduleClass.startsAt.toDate?.() ?? new Date(scheduleClass.startsAt);
  const endsAt = scheduleClass.endsAt.toDate?.() ?? new Date(scheduleClass.endsAt);
  const date = new Intl.DateTimeFormat('en-KE', { dateStyle: 'full', timeZone: 'Africa/Nairobi' }).format(startsAt);
  const time = new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' });
  const firstLine = {
    scheduled: 'New class added to your schedule',
    cancelled: 'This class has been cancelled and removed from your schedule',
    restored: 'This class has been restored to your schedule',
    deleted: 'This class has been permanently removed from your schedule',
  }[action];
  const lines = [
    `${firstLine}: ${scheduleClass.title}`,
    `Instructor: ${instructorName}`,
    `Programme: ${programmeLabel(scheduleClass.programmeId)}`,
    `Date: ${date}`,
    `Time: ${time.format(startsAt)} to ${time.format(endsAt)} EAT`,
    `Format: ${scheduleClass.mode === 'online' ? 'Online' : 'In person'}`,
  ];
  if (scheduleClass.location) lines.push(`Location: ${scheduleClass.location}`);
  if (scheduleClass.joinLink) lines.push(`Join link: ${scheduleClass.joinLink}`);
  if (scheduleClass.notes) lines.push(`Notes: ${scheduleClass.notes}`);
  return lines.join('\n');
}

async function recipientsFor(db, programmeId) {
  const enrolments = await db.collection('enrolments').where('programmeId', '==', programmeId).get();
  const studentIds = [...new Set(enrolments.docs.map((doc) => doc.data().studentId).filter(Boolean))];
  const users = await Promise.all(studentIds.map((uid) => db.collection('users').doc(uid).get()));
  const active = users.filter((user) => user.exists && user.data().role === 'student' && user.data().status === 'active');
  // "Class reminders" in the student's account settings: on unless they have switched it off.
  const records = await Promise.all(active.map((user) => db.collection('students').doc(user.id).get()));
  return active.map((user, index) => ({
    uid: user.id,
    ...user.data(),
    classReminders: !(records[index].exists && records[index].data()?.preferences?.classReminders === false),
  }));
}

export async function sendScheduleChangeCore(deps, { classId, eventId, action, scheduleClass }) {
  if (!scheduleClass?.instructorId || !scheduleClass.programmeId) return { sent: 0 };
  const recipients = await recipientsFor(deps.db, scheduleClass.programmeId);
  if (!recipients.length) return { sent: 0 };
  const instructorSnap = await deps.db.collection('users').doc(scheduleClass.instructorId).get();
  const instructorName = instructorSnap.exists && instructorSnap.data().displayName || scheduleClass.instructorName || 'Your instructor';
  const body = announcementBody(scheduleClass, action, instructorName);
  const titles = {
    scheduled: `New class: ${scheduleClass.title}`,
    cancelled: `Class cancelled: ${scheduleClass.title}`,
    restored: `Class restored: ${scheduleClass.title}`,
    deleted: `Class removed: ${scheduleClass.title}`,
  };
  const eventKey = createHash('sha256').update(String(eventId)).digest('hex').slice(0, 20);

  for (let offset = 0; offset < recipients.length; offset += RECIPIENTS_PER_BATCH) {
    const batch = deps.db.batch();
    recipients.slice(offset, offset + RECIPIENTS_PER_BATCH).forEach((student) => {
      const threadId = `${student.uid}_${scheduleClass.instructorId}`;
      const messageId = `class_${classId}_${student.uid}_${eventKey}`;
      batch.set(deps.db.collection('messages').doc(messageId), {
        threadId,
        participants: [student.uid, scheduleClass.instructorId],
        studentId: student.uid,
        instructorId: scheduleClass.instructorId,
        studentName: student.displayName || student.email || 'Student',
        instructorName,
        senderId: scheduleClass.instructorId,
        recipientId: student.uid,
        senderRole: 'instructor',
        kind: 'class_announcement',
        classId,
        body,
        createdAt: deps.FieldValue.serverTimestamp(),
        readAt: null,
      });
      // The announcement stays in their messages either way; the alert is what the setting turns off.
      if (!student.classReminders) return;
      batch.set(deps.db.collection('notifications').doc(`class_${classId}_${student.uid}`), {
        userId: student.uid,
        type: 'class',
        category: 'class',
        title: titles[action],
        body: `Open Messages for the class details from ${instructorName}.`,
        link: `/student/messages?with=${encodeURIComponent(scheduleClass.instructorId)}`,
        sourceId: classId,
        createdAt: deps.FieldValue.serverTimestamp(),
        readAt: null,
        archivedAt: null,
      });
    });
    await batch.commit();
  }
  return { sent: recipients.length };
}

export const notifyScheduleChanges = onDocumentWritten({
  document: 'schedules/{classId}', retry: true, timeoutSeconds: 120,
}, async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null;
  const after = event.data?.after.exists ? event.data.after.data() : null;
  const action = actionFor(before, after);
  if (!action) return;
  const scheduleClass = after ?? before;
  try {
    const result = await sendScheduleChangeCore({ ...services(), batch: true }, {
      classId: event.params.classId, eventId: event.id, action, scheduleClass,
    });
    logger.info('schedule change announced', { classId: event.params.classId, action, sent: result.sent });
  } catch (error) {
    logger.error('schedule announcement failed', { classId: event.params.classId, action, error: String(error) });
    throw error;
  }
});