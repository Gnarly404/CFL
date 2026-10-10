import { guardPage } from '@/auth/guards.js';
import { ROUTES } from '@/core/routes.js';
import { loadQueue, studentName } from '@/review/queue.js';
import { getInstructorDashboardData } from '@/services/instructor-service.js';
import { h } from '@/ui/h.js';
import { mountInstructorShell } from '@/ui/instructor-shell.js';

mountInstructorShell('dashboard');
const session = await guardPage({ roles: ['instructor', 'admin'] });
const $ = (id) => document.getElementById(id);
const note = (text) => { $('dashNote').hidden = false; $('dashNote').textContent = text; };

try {
  const data = await getInstructorDashboardData(session.user.uid);
  $('instructorName').textContent = data.displayName || session.user.displayName || session.user.email;
  $('instructorBio').textContent = data.bio || 'No biography has been added yet.';
} catch (error) {
  console.warn('Could not load the instructor profile', error?.code ?? error);
  $('instructorName').textContent = session.user.displayName || session.user.email;
  $('instructorBio').textContent = '';
  note('Your profile could not be loaded.');
}

try {
  const { students, items, failed } = await loadQueue(session.user.uid);
  const waiting = items.filter((item) => !item.feedback).length;
  $('awaitTitle').textContent = waiting ? `${waiting} ${waiting === 1 ? 'piece' : 'pieces'} of writing waiting for feedback` : 'No writing is waiting for feedback';
  $('awaitAction').replaceChildren(h('a', { class: waiting ? 'btn btn-primary' : 'btn', href: ROUTES.instructorReview }, waiting ? 'Open review queue' : 'View all submissions'));
  $('assignedStudents').replaceChildren(...(students.length
    ? students.map((s) => h('li', {}, h('strong', {}, studentName(s)), h('div', { class: 'muted' }, s.email ?? '')))
    : [h('li', { class: 'muted' }, 'No assigned students yet.')]));
  if (failed.length) note('Some students’ submissions could not be loaded, so the count above may be too low.');
} catch (error) {
  console.warn('Could not load the review queue', error?.code ?? error);
  $('awaitTitle').textContent = 'Writing review is unavailable';
  $('assignedStudents').replaceChildren(h('li', { class: 'muted' }, 'The student list could not be loaded.'));
  note('The review queue could not be loaded. Check your connection and refresh.');
}
