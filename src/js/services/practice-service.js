import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
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
