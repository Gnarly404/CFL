import { onCall, HttpsError } from 'firebase-functions/https';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { SMTP_PASS } from '../lib/config.js';

const MAX_TITLE = 120;
const MAX_LOCATION = 200;
const MAX_NOTES = 500;
const RECIPIENTS_PER_BATCH = 200;
const isText = (value) => typeof value === 'string';

function parseClass(data) {
  const programmeId = isText(data?.programmeId) ? data.programmeId.trim() : '';
  const title = isText(data?.title) ? data.title.trim() : '';
  const mode = data?.mode;
  const startsAt = new Date(data?.startsAt);
  const endsAt = new Date(data?.endsAt);
  const location = isText(data?.location) ? data.location.trim() : '';
  const notes = isText(data?.notes) ? data.notes.trim() : '';
  const joinLink = isText(data?.joinLink) ? data.joinLink.trim() : '';
  let safeJoinLink = '';
  if (joinLink) {
    if (joinLink.length > 500) throw new HttpsError('invalid-argument', 'Keep the join link under 500 characters.');
    try {
      const url = new URL(joinLink);
      if (url.protocol !== 'https:') throw new Error('invalid protocol');
      safeJoinLink = url.href;
    } catch {
      throw new HttpsError('invalid-argument', 'The join link must start with https://.');
    }
  }

  if (!/^[a-z0-9_-]{1,100}$/i.test(programmeId)) throw new HttpsError('invalid-argument', 'Choose a valid programme.');
  if (!title || title.length > MAX_TITLE) throw new HttpsError('invalid-argument', `Give the class a title under ${MAX_TITLE + 1} characters.`);
  if (!['in_person', 'online'].includes(mode)) throw new HttpsError('invalid-argument', 'Choose in person or online.');
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new HttpsError('invalid-argument', 'The end time must be after the start time.');
  }
  if (location.length > MAX_LOCATION) throw new HttpsError('invalid-argument', `Keep the location under ${MAX_LOCATION + 1} characters.`);
  if (notes.length > MAX_NOTES) throw new HttpsError('invalid-argument', `Keep the notes under ${MAX_NOTES + 1} characters.`);

  return { programmeId, title, mode, startsAt, endsAt, location, notes, joinLink: safeJoinLink };
}

function classMessage(value, instructorName) {
  const date = new Intl.DateTimeFormat('en-KE', { dateStyle: 'full', timeZone: 'Africa/Nairobi' }).format(value.startsAt);
  const time = new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' });
  const lines = [
    `Class scheduled: ${value.title}`,
    `Instructor: ${instructorName}`,
    `Programme: ${value.programmeId.split(/[-_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`,
    `Date: ${date}`,
    `Time: ${time.format(value.startsAt)} to ${time.format(value.endsAt)} EAT`,
    `Format: ${value.mode === 'online' ? 'Online' : 'In person'}`,
  ];
  if (value.location) lines.push(`Location: ${value.location}`);
  if (value.joinLink) lines.push(`Join link: ${value.joinLink}`);
  if (value.notes) lines.push(`Notes: ${value.notes}`);
  return lines.join('\n');
}

async function activeStudentsForProgramme(db, programmeId) {
  const enrolments = await db.collection('enrolments').where('programmeId', '==', programmeId).get();
  const ids = [...new Set(enrolments.docs.map((doc) => doc.data().studentId).filter((id) => isText(id) && id))];
  const users = await Promise.all(ids.map((id) => db.collection('users').doc(id).get()));
  return users
    .filter((user) => user.exists && user.data().role === 'student' && user.data().status !== 'disabled')
    .map((user) => ({ uid: user.id, data: user.data() }));
}

async function sendAnnouncements(deps, { recipients, instructor, value, classId }) {
  const { db, FieldValue, log } = deps;
  let sent = 0;
  let failed = 0;
  const body = classMessage(value, instructor.displayName || 'Your instructor');

  for (let offset = 0; offset < recipients.length; offset += RECIPIENTS_PER_BATCH) {
    const group = recipients.slice(offset, offset + RECIPIENTS_PER_BATCH);
    const batch = db.batch();
    for (const student of group) {
      const threadId = `${student.uid}_${instructor.uid}`;
      const messageRef = db.collection('messages').doc();
      const notificationRef = db.collection('notifications').doc(`class_${classId}_${student.uid}`);
      batch.set(messageRef, {
        threadId,
        participants: [student.uid, instructor.uid],
        studentId: student.uid,
        instructorId: instructor.uid,
        studentName: student.data.displayName || student.data.email || 'Student',
        instructorName: instructor.displayName || 'Your instructor',
        senderId: instructor.uid,
        recipientId: student.uid,
        senderRole: 'instructor',
        kind: 'class_announcement',
        classId,
        body,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });
      batch.set(notificationRef, {
        userId: student.uid,
        type: 'class',
        category: 'class',
        title: `New class: ${value.title}`,
        body: `Class details from ${instructor.displayName || 'your instructor'}.`,
        link: `/student/messages?with=${encodeURIComponent(instructor.uid)}`,
        sourceId: classId,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
        archivedAt: null,
      });
    }
    try {
      await batch.commit();
      sent += group.length;
    } catch (error) {
      failed += group.length;
      log?.error?.('class announcement batch failed', { classId, error: String(error) });
    }
  }
  return { sent, failed };
}

export async function scheduleClassCore(deps, { actor, data }) {
  const value = parseClass(data);
  const recipients = await activeStudentsForProgramme(deps.db, value.programmeId);
  const instructorSnap = await deps.db.collection('users').doc(actor.uid).get();
  const instructor = {
    uid: actor.uid,
    displayName: instructorSnap.exists && instructorSnap.data().displayName || actor.email || 'Instructor',
  };
  const classRef = deps.db.collection('schedules').doc();
  await classRef.set({
    ...value,
    status: 'scheduled',
    instructorId: actor.uid,
    instructorName: instructor.displayName,
    createdBy: actor.uid,
    createdAt: deps.FieldValue.serverTimestamp(),
    updatedAt: deps.FieldValue.serverTimestamp(),
  });
  const delivery = await sendAnnouncements(deps, { recipients, instructor, value, classId: classRef.id });
  return { classId: classRef.id, recipientCount: recipients.length, ...delivery };
}

export const scheduleClass = onCall({ cors: true, timeoutSeconds: 120, secrets: [SMTP_PASS] }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['instructor'], deps);
  return scheduleClassCore(deps, { actor, data: request.data });
});