import { guardPage } from '@/auth/guards.js';
import { getInstructorDashboardData } from '@/services/instructor-service.js';

const session = await guardPage({ roles: ['instructor', 'admin'] });
const name = document.getElementById('instructorName');
const bio = document.getElementById('instructorBio');
const courses = document.getElementById('assignedCourses');
const students = document.getElementById('assignedStudents');

try {
  const data = await getInstructorDashboardData(session.user.uid);
  if (name) name.textContent = data.displayName || session.user.displayName || session.user.email;
  if (bio) bio.textContent = data.bio || 'No biography has been added yet.';
  if (courses) {
    courses.replaceChildren(...(data.assignedCourses.length
      ? data.assignedCourses.map((course) => {
          const item = document.createElement('li');
          item.textContent = typeof course === 'string' ? course : course.name || 'Unnamed course';
          return item;
        })
      : [Object.assign(document.createElement('li'), { textContent: 'No assigned courses yet.' })]));
  }

  if (students) {
    students.replaceChildren(...(data.students.length
      ? data.students.map((student) => {
          const item = document.createElement('li');
          item.textContent = `${student.displayName || student.email || 'Student'} (${student.email || 'No email'})`;
          return item;
        })
      : [Object.assign(document.createElement('li'), { textContent: 'No assigned students yet.' })]));
  }
} catch (error) {
  console.error('Could not load the instructor dashboard', error);
  if (name) name.textContent = session.user.displayName || session.user.email;
  if (bio) bio.textContent = 'The instructor data could not be loaded.';
  if (courses) courses.replaceChildren(Object.assign(document.createElement('li'), { textContent: 'The course list could not be loaded.' }));
  if (students) students.replaceChildren(Object.assign(document.createElement('li'), { textContent: 'The student list could not be loaded.' }));
}
