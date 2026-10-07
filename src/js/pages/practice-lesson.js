import grammar from '../../data/practice/grammar.json';
import { guardPage } from '@/auth/guards.js';
import { ROUTES } from '@/core/routes.js';
import { scoreAttempt } from '@/practice/engine.js';
import { loadLessonProgress, saveLessonResult } from '@/services/practice-service.js';
import { h } from '@/ui/h.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('practice');
const session = await guardPage({ roles: ['student'] });

const params = new URLSearchParams(window.location.search);
const lessonIndex = params.get('skill') === 'grammar' ? grammar.lessons.findIndex((l) => l.id === params.get('id')) : -1;
const lesson = grammar.lessons[lessonIndex];
const stage = document.getElementById('stage');

document.getElementById('crumbs').replaceChildren(
  h('li', {}, h('a', { href: ROUTES.practice }, 'English Practice')),
  h('li', {}, 'Grammar'),
  ...(lesson ? [h('li', { 'aria-current': 'page' }, lesson.title)] : []),
);

if (!lesson) {
  stage.replaceChildren(h('h1', {}, 'Lesson not found'), h('p', { class: 'muted' }, 'This lesson does not exist.'),
    h('a', { class: 'btn btn-primary', href: ROUTES.practice }, 'Back to English Practice'));
} else {
  document.title = `${lesson.title} - CFL English Practice`;
  await runLesson();
}

async function runLesson() {
  const questions = lesson.questions;
  let progress = {};
  try { progress = await loadLessonProgress(session.user.uid, 'grammar'); } catch (error) { console.warn('Could not load progress', error?.code ?? error); }

  let step = 'learn';
  let index = 0;
  let picked = null;
  let checked = false;
  let answers = [];
  let error = '';
  let saveNote = '';
  let result = null;

  const focusHeading = () => document.getElementById('stageHeading')?.focus();
  const show = (...nodes) => { stage.replaceChildren(...nodes); focusHeading(); };

  function renderLearn() {
    show(
      h('p', { class: 'step-meta' }, 'Step 1 of 2: Learn'),
      h('h1', { id: 'stageHeading', tabindex: '-1' }, lesson.title),
      h('h2', {}, 'The rule'),
      h('ul', { class: 'rule-list' }, ...lesson.rule.map((line) => h('li', {}, line))),
      h('h2', {}, 'Examples'),
      h('ul', { class: 'example-list' }, ...lesson.examples.map((ex) => h('li', {}, ex.text, ' ', h('em', {}, `(${ex.note})`)))),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'startBtn' }, 'Start practice')),
    );
    document.getElementById('startBtn').addEventListener('click', () => { step = 'question'; render(); });
  }

  function renderQuestion() {
    const q = questions[index];
    const form = h('form', { class: 'practice-form', novalidate: true });
    const options = q.options.map((text, i) => {
      const input = h('input', { type: 'radio', name: 'answer', id: `opt-${i}`, value: i, disabled: checked });
      input.checked = picked === i;
      input.addEventListener('change', () => { picked = i; });
      const isRight = checked && i === q.answer;
      const isWrong = checked && picked === i && i !== q.answer;
      return h('label', { class: `option${isRight ? ' is-correct' : ''}${isWrong ? ' is-wrong' : ''}`, for: `opt-${i}` },
        input, h('span', {}, text), isRight ? h('span', { class: 'tag' }, 'Correct answer') : '', isWrong ? h('span', { class: 'tag' }, 'Your answer') : '');
    });
    const fieldset = h('fieldset', {}, h('legend', { id: 'stageHeading', tabindex: '-1' }, q.prompt), ...options);
    const feedback = checked
      ? h('div', { class: 'feedback', role: 'status' }, h('strong', {}, picked === q.answer ? 'Correct' : 'Not quite'), q.why)
      : '';
    const last = index === questions.length - 1;
    form.append(fieldset, feedback, error ? h('p', { class: 'form-note', role: 'alert' }, error) : '',
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, !checked ? 'Check answer' : last ? 'See results' : 'Next question')));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!checked) {
        if (picked === null) { error = 'Choose an answer first.'; render(); return; }
        error = ''; checked = true; answers[index] = picked; render(); return;
      }
      if (!last) { index += 1; picked = null; checked = false; render(); return; }
      finish();
    });
    show(h('p', { class: 'step-meta' }, `Step 2 of 2: Practice · Question ${index + 1} of ${questions.length}`), form);
  }

  async function persist() {
    saveNote = 'Saving your progress…';
    render();
    try {
      const record = await saveLessonResult(session.user.uid, 'grammar', lesson.id, result, progress[lesson.id]);
      progress = { ...progress, [lesson.id]: record };
      saveNote = 'Progress saved.';
    } catch (err) {
      console.warn('Could not save progress', err?.code ?? err);
      saveNote = 'Your progress could not be saved.';
    }
    render();
  }

  function finish() {
    result = scoreAttempt(questions, answers);
    step = 'results';
    persist();
  }

  function renderResults() {
    const missed = questions.filter((q) => result.mistakes.includes(q.id));
    const following = grammar.lessons[lessonIndex + 1];
    const retrySave = saveNote === 'Your progress could not be saved.'
      ? h('button', { class: 'btn', type: 'button', id: 'retrySave' }, 'Try saving again') : '';
    show(
      h('p', { class: 'step-meta' }, 'Results'),
      h('h1', { id: 'stageHeading', tabindex: '-1' }, lesson.title),
      h('p', { class: 'score' }, `${result.correct} of ${result.total}`),
      h('p', { class: 'muted', role: 'status' }, saveNote),
      missed.length
        ? h('div', {}, h('h2', {}, 'Review your mistakes'), h('ul', { class: 'review-list' }, ...missed.map((q) => h('li', {},
          h('strong', {}, q.prompt), h('div', {}, `Correct answer: ${q.options[q.answer]}`), h('div', { class: 'muted' }, q.why)))))
        : h('p', {}, 'No mistakes. Well done.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', id: 'again' }, 'Try again'),
        following ? h('a', { class: 'btn btn-primary', href: `${ROUTES.practiceLesson}?skill=grammar&id=${encodeURIComponent(following.id)}` }, 'Next lesson') : '',
        h('a', { class: 'btn', href: ROUTES.practice }, 'Back to English Practice'),
        retrySave),
    );
    document.getElementById('again').addEventListener('click', () => {
      step = 'question'; index = 0; picked = null; checked = false; answers = []; result = null; saveNote = ''; render();
    });
    document.getElementById('retrySave')?.addEventListener('click', persist);
  }

  function render() {
    if (step === 'learn') renderLearn();
    else if (step === 'question') renderQuestion();
    else renderResults();
  }
  render();
}
