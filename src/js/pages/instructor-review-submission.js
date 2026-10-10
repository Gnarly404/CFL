import { guardPage } from '@/auth/guards.js';
import { ROUTES } from '@/core/routes.js';
import { cleanFeedback, MAX_NOTE, MAX_NOTES, MAX_OVERALL, segments } from '@/review/feedback.js';
import { studentName, taskFor } from '@/review/queue.js';
import { countWords } from '@/practice/writing.js';
import { listAssignedStudents, loadMyFeedback, loadSubmittedWork, saveFeedback } from '@/services/review-service.js';
import { h } from '@/ui/h.js';
import { mountInstructorShell } from '@/ui/instructor-shell.js';

mountInstructorShell('review');
const session = await guardPage({ roles: ['instructor', 'admin'] });
const stage = document.getElementById('stage');
const params = new URLSearchParams(window.location.search);
const back = h('a', { class: 'btn', href: ROUTES.instructorReview }, 'Back to the queue');
const fail = (title, text) => stage.replaceChildren(h('h1', {}, title), h('p', { class: 'muted' }, text), h('div', { class: 'actions' }, back));

let submission = null;
let student = null;
let existing = null;
try {
  const studentId = params.get('student');
  const [students, work, mine] = await Promise.all([
    listAssignedStudents(session.user.uid), studentId ? loadSubmittedWork(studentId) : [], loadMyFeedback(session.user.uid),
  ]);
  student = students.find((s) => s.uid === studentId) ?? null;
  submission = student ? work.find((w) => w.id === params.get('id')) ?? null : null;
  existing = submission ? mine[submission.id] ?? null : null;
} catch (error) {
  console.warn('Could not load the submission', error?.code ?? error);
  fail('Could not load this writing', 'Check your connection and try again.');
  submission = false;
}

if (submission === null) fail('Writing not found', 'It may not be submitted yet, or it may belong to a student you are not assigned to.');
else if (submission) run();

function run() {
  const text = submission.content ?? '';
  const task = taskFor(submission.promptId);
  let notes = (existing?.notes ?? []).map((n) => ({ quote: n.quote ?? '', note: n.note ?? '' }));
  let overall = existing?.overall ?? '';
  let status = '';
  let errors = [];
  let saving = false;

  const original = () => h('blockquote', { class: 'submitted-text' }, ...segments(text, notes).map((part) => (part.note === null
    ? part.text
    : h('mark', { title: `Note ${part.note + 1}` }, part.text, h('sup', {}, part.note + 1)))));

  function draw() {
    const noteRows = notes.map((n, i) => {
      const quote = h('input', { type: 'text', id: `quote-${i}`, class: 'writing-line', value: n.quote, maxlength: 300 });
      const note = h('textarea', { id: `note-${i}`, rows: 2, class: 'writing-box', maxlength: MAX_NOTE });
      note.value = n.note;
      quote.addEventListener('input', () => { notes[i].quote = quote.value; });
      note.addEventListener('input', () => { notes[i].note = note.value; });
      quote.addEventListener('change', draw);
      const remove = h('button', { class: 'btn', type: 'button' }, `Remove note ${i + 1}`);
      remove.addEventListener('click', () => { notes.splice(i, 1); draw(); });
      return h('fieldset', { class: 'note-row' }, h('legend', {}, `Note ${i + 1}`),
        h('label', { for: `quote-${i}` }, 'Words from the writing (optional, copy exactly)'), quote,
        h('label', { for: `note-${i}` }, 'Your comment'), note, remove);
    });
    const overallBox = h('textarea', { id: 'overall', rows: 5, class: 'writing-box', maxlength: MAX_OVERALL });
    overallBox.value = overall;
    overallBox.addEventListener('input', () => { overall = overallBox.value; });
    const add = h('button', { class: 'btn', type: 'button', id: 'addNote' }, 'Add a note');
    add.disabled = notes.length >= MAX_NOTES;
    add.addEventListener('click', () => { notes.push({ quote: '', note: '' }); draw(); document.getElementById(`note-${notes.length - 1}`)?.focus(); });
    const save = h('button', { class: 'btn btn-primary', type: 'button', id: 'saveFeedback' }, existing ? 'Update feedback' : 'Send feedback');
    save.disabled = saving;
    save.addEventListener('click', submit);

    stage.replaceChildren(
      h('header', { class: 'portal-head' }, h('h1', { id: 'stageHeading', tabindex: '-1' }, studentName(student)),
        h('p', { class: 'muted' }, `${task?.topic ?? 'Writing task'} · ${countWords(text)} words`)),
      h('section', { class: 'card' }, h('h2', {}, "Student's writing"),
        h('p', { class: 'muted' }, 'This is exactly what the student submitted. It cannot be changed here. Quoted words from your notes are marked.'), original()),
      h('section', { class: 'card' }, h('h2', {}, 'Your feedback'),
        h('label', { for: 'overall', class: 'eyebrow' }, 'Overall comment'), overallBox,
        h('h3', {}, 'Notes'), ...noteRows, add,
        errors.length ? h('ul', { class: 'form-note', role: 'alert' }, ...errors.map((e) => h('li', {}, e))) : '',
        h('p', { class: 'muted', role: 'status' }, status),
        h('div', { class: 'actions' }, save, back)),
    );
  }

  async function submit() {
    const { errors: found, value } = cleanFeedback({ overall, notes }, text);
    errors = found;
    if (found.length) { status = ''; draw(); return; }
    saving = true; status = 'Saving…'; draw();
    try {
      await saveFeedback(session.user.uid, submission, value, existing);
      existing = { ...(existing ?? {}), ...value };
      status = 'Feedback saved. The student can see it now.';
    } catch (error) {
      console.warn('Could not save feedback', error?.code ?? error);
      status = 'Your feedback could not be saved. Your text is still here. Try again.';
    }
    saving = false;
    draw();
  }

  draw();
}
