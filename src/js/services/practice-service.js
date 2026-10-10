import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { dbService } from './firebase-db.js';

/** Progress for one skill as { [lessonId]: record }. Security rules let a student read only their own records. */
export async function loadLessonProgress(uid, skill) {
  const snap = await getDocs(query(
    collection(dbService(), 'lessonProgress'),
    where('studentId', '==', uid),
    where('skill', '==', skill),
  ));
  return Object.fromEntries(snap.docs.map((entry) => [entry.data().lessonId, entry.data()]));
}

export async function saveLessonResult(uid, skill, lessonId, result, previous) {
  const record = {
    studentId: uid,
    skill,
    lessonId,
    status: 'completed',
    attempts: (previous?.attempts ?? 0) + 1,
    bestPercent: result.percent == null ? null : Math.max(previous?.bestPercent ?? 0, result.percent),
    lastPercent: result.percent,
    mistakes: result.mistakes,
    ...(result.extra ?? {}),
  };
  await setDoc(doc(dbService(), 'lessonProgress', `${uid}_${lessonId}`), { ...record, updatedAt: serverTimestamp() });
  return record;
}

/** Mistakes for a student as { [questionId]: record }. */
export async function loadMistakes(uid) {
  const snap = await getDocs(query(collection(dbService(), 'mistakes'), where('studentId', '==', uid)));
  return Object.fromEntries(snap.docs.map((entry) => [entry.data().questionId, entry.data()]));
}

export async function saveMistakes(uid, updates) {
  await Promise.all(updates.map((update) => setDoc(
    doc(dbService(), 'mistakes', `${uid}_${update.questionId}`),
    { ...update, studentId: uid, updatedAt: serverTimestamp() },
  )));
}

const submissionRef = (uid, promptId) => doc(dbService(), 'submissions', `${uid}_${promptId}`);

/** The student's submission for a prompt, or null. Uses a query so security rules never evaluate a missing document. */
export async function loadSubmission(uid, promptId) {
  const snap = await getDocs(query(
    collection(dbService(), 'submissions'),
    where('studentId', '==', uid),
    where('promptId', '==', promptId),
  ));
  return snap.empty ? null : snap.docs[0].data();
}

export async function createDraft(uid, { skill, lessonId, promptId, content }) {
  await setDoc(submissionRef(uid, promptId), {
    studentId: uid, skill, lessonId, promptId, status: 'draft', content, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

/** Rules allow a draft to change only content, status and timestamps, so nothing else is written here. */
export async function updateDraft(uid, promptId, content) {
  await updateDoc(submissionRef(uid, promptId), { content, updatedAt: serverTimestamp() });
}

export async function submitDraft(uid, promptId, content) {
  await updateDoc(submissionRef(uid, promptId), { content, status: 'submitted', submittedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/** One finished practice session. Written once and never changed, so daily totals and streaks come from real activity. */
export async function recordSession(uid, { skill, lessonId, kind, seconds, date }) {
  await setDoc(doc(dbService(), 'practiceSessions', `${uid}_${lessonId}_${Date.now()}`), {
    studentId: uid, skill, lessonId, kind, seconds, date, createdAt: serverTimestamp(),
  });
}

/** Sessions on or after a YYYY-MM-DD day. Needs the studentId + date index. */
export async function loadSessions(uid, sinceDate) {
  const snap = await getDocs(query(
    collection(dbService(), 'practiceSessions'),
    where('studentId', '==', uid),
    where('date', '>=', sinceDate),
  ));
  return snap.docs.map((entry) => {
    const data = entry.data();
    return { ...data, createdAtMs: data.createdAt?.toMillis?.() ?? Date.parse(`${data.date}T12:00:00`) };
  });
}
