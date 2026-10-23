import { onCall, HttpsError } from '../lib/secure-call.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { HOUR } from '../lib/rate-limit.js';

export const MAX_BODY = 2000;
export const SEND_LIMIT = { limit: 30, windowMs: HOUR };
const ID = /^[A-Za-z0-9_-]{1,200}$/;

/** Plain text only: control characters (other than new lines and tabs) are dropped and runs of blank lines collapsed. */
export function cleanBody(raw) {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const threadIdFor = (studentId, instructorId) => `${studentId}_${instructorId}`;

const nameOf = (snap, fallback) => (snap.exists && typeof snap.data().displayName === 'string' && snap.data().displayName.trim()) || fallback;
const preview = (text) => (text.length > 120 ? `${text.slice(0, 117)}...` : text);

/** The student a pair belongs to, and the instructor, from the caller's point of view. Only assigned pairs may talk. */
async function resolvePair(db, actor, recipientId) {
  const studentId = actor.role === 'student' ? actor.uid : recipientId;
  const instructorId = actor.role === 'student' ? recipientId : actor.uid;
  const student = await db.collection('students').doc(studentId).get();
  const assigned = student.exists && Array.isArray(student.data().instructorIds) && student.data().instructorIds.includes(instructorId);
  if (!assigned) {
    throw new HttpsError('permission-denied', actor.role === 'student'
      ? 'You can only message a teacher who is assigned to you.'
      : 'You can only message students who are assigned to you.');
  }
  return { studentId, instructorId };
}

/**
 * Sends one message between a student and one of their assigned teachers. Browsers cannot create messages (the rules
 * forbid it), so everything is checked here against the database: both people must exist and be active, they must be
 * assigned to each other, the text is cleaned, and senders are rate limited. A student recipient also gets one
 * notification per conversation, which is refreshed (and marked unread again) by each new message.
 */
export async function sendMessageCore(deps, { actor, data }) {
  const { db, FieldValue, limiter, log } = deps;
  const recipientId = typeof data?.recipientId === 'string' ? data.recipientId : '';
  if (!ID.test(recipientId) || recipientId === actor.uid) throw new HttpsError('invalid-argument', 'Choose who to message.');
  const body = cleanBody(data?.body);
  if (!body) throw new HttpsError('invalid-argument', 'Write a message first.');
  if (body.length > MAX_BODY) throw new HttpsError('invalid-argument', `Keep messages under ${MAX_BODY} characters.`);

  const { studentId, instructorId } = await resolvePair(db, actor, recipientId);

  const [studentUser, instructorUser] = await Promise.all([
    db.collection('users').doc(studentId).get(), db.collection('users').doc(instructorId).get(),
  ]);
  if (!studentUser.exists || !instructorUser.exists || studentUser.data().status === 'disabled' || instructorUser.data().status === 'disabled') {
    throw new HttpsError('failed-precondition', 'That account cannot receive messages right now.');
  }

  const rate = await limiter.hit(`msg:${actor.uid}`, SEND_LIMIT);
  if (!rate.allowed) throw new HttpsError('resource-exhausted', 'You are sending messages too quickly. Wait a little and try again.');

  const studentName = nameOf(studentUser, 'Student');
  const instructorName = nameOf(instructorUser, 'Your teacher');
  const threadId = threadIdFor(studentId, instructorId);
  const added = await db.collection('messages').add({
    threadId, participants: [studentId, instructorId], studentId, instructorId, studentName, instructorName,
    senderId: actor.uid, recipientId, senderRole: actor.role, body,
    createdAt: FieldValue.serverTimestamp(), readAt: null,
  });

  if (recipientId === studentId) {
    try {
      await db.collection('notifications').doc(`message_${threadId}`).set({
        userId: studentId, type: 'message', category: 'teacher',
        title: `New message from ${instructorName}`, body: preview(body),
        link: `/student/messages?with=${instructorId}`, sourceId: threadId,
        createdAt: FieldValue.serverTimestamp(), readAt: null, archivedAt: null,
      });
    } catch (error) {
      log?.warn?.('message notification failed', { threadId, error: String(error) });
    }
  }
  return { id: added.id, threadId };
}

/** Who the caller may message: a student's assigned teachers, or an instructor's assigned students. */
export async function listContactsCore(deps, { actor }) {
  const { db } = deps;
  let ids;
  if (actor.role === 'student') {
    const student = await db.collection('students').doc(actor.uid).get();
    ids = student.exists && Array.isArray(student.data().instructorIds) ? student.data().instructorIds : [];
  } else {
    const snap = await db.collection('students').where('instructorIds', 'array-contains', actor.uid).limit(200).get();
    ids = snap.docs.map((d) => d.id);
  }
  const users = await Promise.all(ids.slice(0, 200).map((id) => db.collection('users').doc(id).get()));
  return users
    .map((snap, i) => ({ uid: ids[i], exists: snap.exists, disabled: snap.exists && snap.data().status === 'disabled', name: nameOf(snap, actor.role === 'student' ? 'Your teacher' : 'Student') }))
    .filter((c) => c.exists && !c.disabled)
    .map(({ uid, name }) => ({ uid, name }));
}

export const sendMessage = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['student', 'instructor'], deps);
  return sendMessageCore(deps, { actor, data: request.data });
});

export const messageContacts = onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['student', 'instructor'], deps);
  return { contacts: await listContactsCore(deps, { actor }) };
});
