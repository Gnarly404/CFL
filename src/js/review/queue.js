import writing from '../../data/practice/writing.json';
import { listAssignedStudents, loadMyFeedback, loadSubmittedWork } from '@/services/review-service.js';

export const taskFor = (promptId) => writing.lessons.find((l) => l.writing.promptId === promptId)?.writing ?? null;
export const studentName = (s) => s?.displayName || s?.profile?.fullName || s?.email || 'Student';

/** Submitted writing from every assigned student, oldest first, each with its feedback if any. `failed` lists students that could not be read. */
export async function loadQueue(instructorId) {
  const students = await listAssignedStudents(instructorId);
  const feedback = await loadMyFeedback(instructorId);
  const failed = [];
  const lists = await Promise.all(students.map(async (student) => {
    try { return (await loadSubmittedWork(student.uid)).map((submission) => ({ submission, student })); } catch (error) {
      console.warn('Could not load submissions for a student', error?.code ?? error);
      failed.push(student);
      return [];
    }
  }));
  const items = lists.flat().map((item) => ({ ...item, feedback: feedback[item.submission.id] ?? null, task: taskFor(item.submission.promptId) }))
    .sort((a, b) => a.submission.submittedAtMs - b.submission.submittedAtMs);
  return { students, items, failed };
}
