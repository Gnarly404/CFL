import { onCall, HttpsError } from 'firebase-functions/https';
import { services } from '../lib/admin.js';
import { requireRole } from '../lib/require-role.js';

const MAX_TITLE = 120;
const MAX_LOCATION = 200;
const MAX_NOTES = 500;
const isText = (value) => typeof value === 'string';
const millis = (value) => value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : 0);
const ID = /^[A-Za-z0-9_-]{1,200}$/;

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

export async function scheduleClassCore(deps, { actor, data }) {
  const value = parseClass(data);
  const staff = await deps.db.collection('programmeStaff').doc(value.programmeId).get();
  const staffIds = staff.exists && Array.isArray(staff.data().instructorIds) ? staff.data().instructorIds : [];
  if (!staffIds.includes(actor.uid)) {
    throw new HttpsError('permission-denied', 'You can schedule classes only for programmes you are assigned to. Ask an administrator to assign you.');
  }
  const instructorSnap = await deps.db.collection('users').doc(actor.uid).get();
  const instructorName = instructorSnap.exists && instructorSnap.data().displayName || actor.email || 'Instructor';
  const classRef = deps.db.collection('schedules').doc();
  const classData = {
    ...value,
    status: 'scheduled',
    instructorId: actor.uid,
    instructorName,
    createdBy: actor.uid,
    createdAt: deps.FieldValue.serverTimestamp(),
    updatedAt: deps.FieldValue.serverTimestamp(),
  };
  const assignedClasses = deps.db.collection('schedules')
    .where('instructorId', '==', actor.uid)
    .where('status', '==', 'scheduled');
  const lockRef = deps.db.collection('scheduleLocks').doc(actor.uid);

  await deps.db.runTransaction(async (transaction) => {
    await transaction.get(lockRef);
    const snapshot = await transaction.get(assignedClasses);
    const start = value.startsAt.getTime();
    const end = value.endsAt.getTime();
    const collision = snapshot.docs.some((entry) => {
      const existing = entry.data();
      return millis(existing.startsAt) < end && millis(existing.endsAt) > start;
    });
    if (collision) throw new HttpsError('already-exists', 'This class overlaps with another class on your schedule. Choose a different time.');
    transaction.set(lockRef, { updatedAt: deps.FieldValue.serverTimestamp() }, { merge: true });
    transaction.create(classRef, classData);
  });
  return { classId: classRef.id };
}

export const scheduleClass = onCall({ cors: true }, async (request) => {
  const deps = services();
  const actor = await requireRole(request, ['instructor'], deps);
  return scheduleClassCore(deps, { actor, data: request.data });
});

export async function manageScheduledClassCore(deps, { actor, data }) {
  const classId = isText(data?.classId) ? data.classId : '';
  const action = data?.action;
  if (!ID.test(classId)) throw new HttpsError('invalid-argument', 'Choose a valid class.');
  if (!['cancel', 'restore', 'delete'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a valid class action.');

  const ref = deps.db.collection('schedules').doc(classId);
  await deps.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'This class no longer exists.');
    const scheduleClass = snapshot.data();
    if (scheduleClass.instructorId !== actor.uid) throw new HttpsError('permission-denied', 'You can manage only your own classes.');
    if (action === 'delete') {
      transaction.delete(ref);
      return;
    }
    const status = action === 'cancel' ? 'cancelled' : 'scheduled';
    if (scheduleClass.status !== status) {
      transaction.update(ref, { status, updatedAt: deps.FieldValue.serverTimestamp() });
    }
  });
  return { classId, action };
}

export const manageScheduledClass = onCall({ cors: true }, async (request) => {
  const deps = services();
  const actor = await requireRole(request, ['instructor'], deps);
  return manageScheduledClassCore(deps, { actor, data: request.data });
});