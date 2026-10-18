import { collection, getDocs, query, where } from 'firebase/firestore';
import { dbService } from './firebase-db.js';
import { call } from './callable.js';

export const savePracticeContent = ({ skillId, content }) => call('instructorSavePracticeContent', { skillId, content });

export async function getInstructorDashboardData(uid) {
  const [instructorSnap, studentSnap] = await Promise.all([
    getDocs(collection(dbService(), 'instructors')),
    getDocs(query(collection(dbService(), 'students'), where('instructorIds', 'array-contains', uid))),
  ]);

  const instructor = instructorSnap.docs.find((doc) => doc.id === uid)?.data() ?? {};
  const students = studentSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));

  return {
    exists: instructorSnap.docs.some((doc) => doc.id === uid),
    preferences: instructor.preferences && typeof instructor.preferences === 'object' ? instructor.preferences : {},
    displayName: instructor.displayName ?? null,
    bio: instructor.bio ?? '',
    assignedCourses: Array.isArray(instructor.assignedCourses) ? instructor.assignedCourses : [],
    students,
  };
}
