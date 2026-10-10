import { guardPage } from '@/auth/guards.js';
import { ROUTES } from '@/core/routes.js';
import { loadQueue, studentName } from '@/review/queue.js';
import { countWords } from '@/practice/writing.js';
import { h } from '@/ui/h.js';
import { mountInstructorShell } from '@/ui/instructor-shell.js';

mountInstructorShell('review');
const session = await guardPage({ roles: ['instructor', 'admin'] });
const $ = (id) => document.getElementById(id);

let result;
try {
  result = await loadQueue(session.user.uid);
} catch (error) {
  console.warn('Could not load the review queue', error?.code ?? error);
  $('queueSummary').textContent = 'The review queue could not be loaded.';
  $('queueNote').hidden = false;
  $('queueNote').textContent = 'Check your connection and refresh the page.';
  result = null;
}

if (result) {
  const { items, failed } = result;
  const waiting = items.filter((i) => !i.feedback);
  const done = items.filter((i) => i.feedback);
  $('queueSummary').textContent = items.length ? `${waiting.length} waiting · ${done.length} with feedback` : 'No submitted writing yet.';
  if (failed.length) {
    $('queueNote').hidden = false;
    $('queueNote').textContent = `Submissions could not be loaded for ${failed.length} ${failed.length === 1 ? 'student' : 'students'}, so this list may be incomplete.`;
  }
  const row = ({ submission, student, feedback, task }) => h('li', { class: 'lesson-row' },
    h('div', {}, h('h3', {}, studentName(student)),
      h('p', {}, `${task?.topic ?? 'Writing task'} · ${countWords(submission.content ?? '')} words${submission.submittedAtMs ? ` · submitted ${new Date(submission.submittedAtMs).toLocaleDateString('en-KE')}` : ''}`)),
    h('a', { class: feedback ? 'btn' : 'btn btn-primary', href: `${ROUTES.instructorReviewSubmission}?student=${encodeURIComponent(submission.studentId)}&id=${encodeURIComponent(submission.id)}` }, feedback ? 'View or edit feedback' : 'Give feedback'));
  const section = (title, list) => (list.length ? h('section', { class: 'card' }, h('h2', {}, title), h('ul', { class: 'lesson-list' }, ...list.map(row))) : '');
  $('queue').replaceChildren(section('Waiting for feedback', waiting), section('Feedback given', done));
}
