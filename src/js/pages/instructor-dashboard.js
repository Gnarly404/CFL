import { guardPage } from '@/auth/guards.js';
import { loadQueue, studentName } from '@/review/queue.js';
import { getInstructorDashboardData } from '@/services/instructor-service.js';
import { initSchedule } from '@/schedule/manager.js';
import { h } from '@/ui/h.js';
import { setAttentionBadge } from '@/ui/attention-badge.js';
import { mountInstructorShell } from '@/ui/instructor-shell.js';
import { mountGreeting } from '@/ui/greeting.js';
import { initInstructorSettings } from '@/instructor/settings.js';
import { dbService } from '@/services/firebase-db.js';
import { requestPasswordReset } from '@/services/password-service.js';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

const session = await guardPage({ roles: ['instructor', 'admin'] });
mountInstructorShell('dashboard', session.role);
const $ = (id) => document.getElementById(id);
const note = (text, kind = 'error') => { $('dashNote').hidden = false; $('dashNote').dataset.kind = kind; $('dashNote').textContent = text; };
let instructorName = session.user.displayName || session.user.email;
mountGreeting({ greetingEl: $('instructorGreeting'), lineEl: $('instructorDayLine'), audience: 'instructor' });
let instructorProfile = null;

try {
  const data = await getInstructorDashboardData(session.user.uid);
  instructorName = data.displayName || instructorName;
  $('instructorName').textContent = instructorName;
  $('instructorBio').textContent = data.bio || 'No biography has been added yet.';
  instructorProfile = data.exists ? { bio: data.bio, preferences: data.preferences } : null;
} catch (error) {
  console.warn('Could not load the instructor profile', error?.code ?? error);
  $('instructorName').textContent = session.user.displayName || session.user.email;
  $('instructorBio').textContent = '';
  note('Your profile could not be loaded.');
}

const settings = initInstructorSettings({
  profile: session.role === 'instructor' ? instructorProfile : null,
  email: session.user.email,
  saveProfile: (changes) => updateDoc(doc(dbService(), 'instructors', session.user.uid), { ...changes, updatedAt: serverTimestamp() }),
  sendReset: requestPasswordReset,
  onBio: (text) => { $('instructorBio').textContent = text || 'No biography has been added yet.'; },
});
document.querySelector('[data-close-settings]')?.addEventListener('click', () => $('instructorSettingsDialog').close());
if (window.location.hash === '#settings') settings.open();
window.addEventListener('hashchange', () => { if (window.location.hash === '#settings') settings.open(); });

if (session.role === 'instructor') {
  const schedule = initSchedule({ root: document, say: note, instructor: { uid: session.user.uid, displayName: instructorName } });
  schedule.load();
} else {
  $('classesHeading')?.closest('section')?.remove();
}

try {
  const { students, items, failed } = await loadQueue(session.user.uid);
  const waiting = items.filter((item) => !item.feedback).length;
  setAttentionBadge('writing-review', waiting);
  $('assignedStudents').replaceChildren(...(students.length
    ? students.map((s) => h('li', {}, h('strong', {}, studentName(s)), h('div', { class: 'muted' }, s.email ?? '')))
    : [h('li', { class: 'muted' }, 'No assigned students yet.')]));
  if (failed.length) note('Some students’ submissions could not be loaded, so the count above may be too low.');
} catch (error) {
  console.warn('Could not load the review queue', error?.code ?? error);
  setAttentionBadge('writing-review', 0);
  $('assignedStudents').replaceChildren(h('li', { class: 'muted' }, 'The student list could not be loaded.'));
  note('The review queue could not be loaded. Check your connection and refresh.');
}
