import {
  addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { dbService } from './firebase-db.js';
import { EARLIER_DAYS, normaliseClass } from '@/schedule/state.js';

const DAY = 86_400_000;

/**
 * The classes for every programme the student is enrolled in, from two weeks ago onward.
 * Rules only allow a student to read a class if they are enrolled in its programme, so each query names one programme.
 */
export async function loadMyClasses(uid, now = Date.now()) {
  const enrolments = await getDocs(query(collection(dbService(), 'enrolments'), where('studentId', '==', uid)));
  const programmeIds = [...new Set(enrolments.docs.map((d) => d.data().programmeId).filter(Boolean))];
  const since = Timestamp.fromMillis(now - EARLIER_DAYS * DAY);
  const snaps = await Promise.all(programmeIds.map((programmeId) => getDocs(query(
    collection(dbService(), 'schedules'),
    where('programmeId', '==', programmeId), where('startsAt', '>=', since), orderBy('startsAt'), limit(100),
  ))));
  return { programmeIds, classes: snaps.flatMap((snap) => snap.docs.map((d) => normaliseClass(d.id, d.data()))) };
}

/** Classes from yesterday onward, soonest first; instructor queries are scoped to their own classes. */
export async function listClasses({ instructorId, now = Date.now(), max = 200 } = {}) {
  const snap = await getDocs(query(
    collection(dbService(), 'schedules'),
    ...(instructorId ? [where('instructorId', '==', instructorId)] : []),
    where('startsAt', '>=', Timestamp.fromMillis(now - DAY)), orderBy('startsAt'), limit(max),
  ));
  return snap.docs.map((d) => normaliseClass(d.id, d.data()));
}

export async function createClass(value, createdByUid) {
  const ref = await addDoc(collection(dbService(), 'schedules'), {
    ...value,
    startsAt: Timestamp.fromDate(value.startsAt),
    endsAt: Timestamp.fromDate(value.endsAt),
    status: 'scheduled',
    createdBy: createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export const setClassCancelled = (id, cancelled) => updateDoc(doc(dbService(), 'schedules', id), {
  status: cancelled ? 'cancelled' : 'scheduled', updatedAt: serverTimestamp(),
});
