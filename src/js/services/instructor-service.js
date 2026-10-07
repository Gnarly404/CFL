import { collection, getDocs, query, where } from 'firebase/firestore';
import { dbService } from './firebase-db.js';

export async function getInstructorDashboardData(uid) {
  const [instructorSnap, studentSnap] = await Promise.all([
    getDocs(collection(dbService(), 'instructors')),
    getDocs(query(collection(dbService(), 'students'), where('instructorIds', 'array-contains', uid))),
  ]);

  const instructor = instructorSnap.docs.find((doc) => doc.id === uid)?.data() ?? {};
  const students = studentSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));

  return {
    displayName: instructor.displayName ?? null,
    bio: instructor.bio ?? '',
    assignedCourses: Array.isArray(instructor.assignedCourses) ? instructor.assignedCourses : [],
    students,
  };
}
