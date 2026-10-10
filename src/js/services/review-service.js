import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { dbService } from './firebase-db.js';

const millis = (value) => value?.toMillis?.() ?? 0;

/** Students whose record lists this instructor. */
export async function listAssignedStudents(uid) {
  const snap = await getDocs(query(collection(dbService(), 'students'), where('instructorIds', 'array-contains', uid)));
  return snap.docs.map((entry) => ({ uid: entry.id, ...entry.data() }));
}

/**
 * Submitted writing for one student. Rules only allow reading submitted work of a student you teach,
 * so the query must name the student and the submitted status.
 */
export async function loadSubmittedWork(studentId) {
  const snap = await getDocs(query(collection(dbService(), 'submissions'), where('studentId', '==', studentId), where('status', '==', 'submitted')));
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data(), submittedAtMs: millis(entry.data().submittedAt) }));
}

/** Feedback this instructor has written, as { [submissionId]: record }. */
export async function loadMyFeedback(instructorId) {
  const snap = await getDocs(query(collection(dbService(), 'feedback'), where('instructorId', '==', instructorId)));
  return Object.fromEntries(snap.docs.map((entry) => [entry.id, entry.data()]));
}

/** Creates feedback, or edits it when `existing` is set. The submission itself is never written. */
export async function saveFeedback(instructorId, submission, value, existing) {
  const ref = doc(dbService(), 'feedback', submission.id);
  if (existing) {
    await updateDoc(ref, { overall: value.overall, notes: value.notes, updatedAt: serverTimestamp() });
    return;
  }
  await setDoc(ref, {
    studentId: submission.studentId, submissionId: submission.id, instructorId, skill: submission.skill, promptId: submission.promptId,
    overall: value.overall, notes: value.notes, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}
