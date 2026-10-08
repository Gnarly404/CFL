import { ROUTES } from '@/core/routes.js';
import { lessonUrl } from '@/practice/content.js';
import { loadLessonProgress, saveLessonResult } from '@/services/practice-service.js';
import { h } from '@/ui/h.js';
import { createRecorder, recordingSupported } from '@/ui/recorder.js';
import { speak, speechSupported } from '@/ui/speech.js';

const CHECKS = ['I answered the question', 'I spoke clearly and not too fast', 'I listened to my recording'];
const PRIVACY = 'Your recordings stay on this device. They are not uploaded or saved, and speaking is not scored automatically.';

/** Phase 1 speaking: prompt, record, play back, self-check. Completion is saved; audio never leaves the browser. */
export async function runSpeaking({ stage, lesson, skill, uid, following }) {
  let progress = {};
  try { progress = await loadLessonProgress(uid, skill.id); } catch (error) { console.warn('Could not load progress', error?.code ?? error); }

  const total = lesson.prompts.length;
  let step = 'prepare';
  let index = 0;
  let recorder = null;
  let recorded = lesson.prompts.map(() => false);
  let checks = lesson.prompts.map(() => 0);
  let saveNote = '';

  const show = (...nodes) => { stage.replaceChildren(...nodes); document.getElementById('stageHeading')?.focus(); };
  const back = () => h('a', { class: 'btn', href: ROUTES.practice }, 'Back to English Practice');

  function renderPrepare() {
    const supported = recordingSupported();
    show(
      h('p', { class: 'step-meta' }, 'Step 1 of 2: Prepare'),
      h('h1', { id: 'stageHeading', tabindex: '-1' }, lesson.title),
      h('p', { class: 'muted' }, `You will answer ${total} questions out loud. Take your time, and record as many times as you like.`),
      h('h2', {}, 'Useful phrases'),
      h('ul', { class: 'rule-list' }, ...lesson.phrases.map((phrase) => h('li', {}, phrase))),
      h('p', { class: 'muted' }, PRIVACY),
      supported ? '' : h('p', { class: 'form-note', role: 'alert' }, 'Recording is not available in this browser. Open this page in a current version of Chrome, Edge, Firefox or Safari over a secure (https) connection.'),
      h('div', { class: 'actions' }, supported ? h('button', { class: 'btn btn-primary', type: 'button', id: 'startBtn' }, 'Start speaking') : '', back()),
    );
    document.getElementById('startBtn')?.addEventListener('click', () => { step = 'prompt'; render(); });
  }

  function renderPrompt() {
    recorder?.destroy();
    const prompt = lesson.prompts[index];
    const last = index === total - 1;
    const boxes = CHECKS.map((text, i) => h('label', { class: 'option', for: `check-${i}` }, h('input', { type: 'checkbox', id: `check-${i}` }), h('span', {}, text)));
    const checklist = h('fieldset', { class: 'checklist' }, h('legend', {}, 'Check yourself'), ...boxes);
    checklist.hidden = true;
    checklist.addEventListener('change', () => { checks[index] = checklist.querySelectorAll('input:checked').length; });
    const next = h('button', { class: 'btn btn-primary', type: 'button' }, last ? 'Finish' : 'Next prompt');
    next.disabled = true;
    const advance = () => { if (last) { finish(); } else { index += 1; render(); } };
    next.addEventListener('click', advance);
    const skip = h('button', { class: 'btn', type: 'button' }, 'Skip this prompt');
    skip.addEventListener('click', advance);
    recorder = createRecorder({
      onChange: (has) => { recorded[index] = has; checklist.hidden = !has; next.disabled = !has; if (!has) checks[index] = 0; },
    });
    const listen = speechSupported() ? h('button', { class: 'btn', type: 'button' }, 'Listen to the question') : '';
    if (listen) listen.addEventListener('click', () => speak(prompt.text));
    show(
      h('p', { class: 'step-meta' }, `Question ${index + 1} of ${total}`),
      h('h1', { id: 'stageHeading', tabindex: '-1' }, prompt.text),
      listen ? h('div', { class: 'actions' }, listen) : '',
      recorder.element,
      checklist,
      h('div', { class: 'actions' }, next, skip),
    );
  }

  async function persist(result) {
    saveNote = 'Saving your progress…';
    render();
    try {
      const record = await saveLessonResult(uid, skill.id, lesson.id, result, progress[lesson.id]);
      progress = { ...progress, [lesson.id]: record };
      saveNote = 'Progress saved.';
    } catch (error) {
      console.warn('Could not save progress', error?.code ?? error);
      saveNote = 'Your progress could not be saved.';
    }
    render();
  }

  let result = null;
  function finish() {
    recorder?.destroy();
    recorder = null;
    step = 'results';
    const recordedCount = recorded.filter(Boolean).length;
    result = {
      percent: null,
      mistakes: [],
      extra: { recordedPrompts: recordedCount, totalPrompts: total, selfChecksPassed: checks.reduce((a, b) => a + b, 0), selfChecksTotal: recordedCount * CHECKS.length },
    };
    if (recordedCount > 0) persist(result); else render();
  }

  function renderResults() {
    const count = result.extra.recordedPrompts;
    const retry = saveNote === 'Your progress could not be saved.' ? h('button', { class: 'btn', type: 'button', id: 'retrySave' }, 'Try saving again') : '';
    show(
      h('p', { class: 'step-meta' }, 'Results'),
      h('h1', { id: 'stageHeading', tabindex: '-1' }, lesson.title),
      h('p', { class: 'score' }, `${count} of ${total} answers recorded`),
      count
        ? h('p', {}, `Self-check: ${result.extra.selfChecksPassed} of ${result.extra.selfChecksTotal} ticked.`)
        : h('p', {}, 'You did not record any answers, so this lesson is not marked as done. Try again when you are ready.'),
      h('p', { class: 'muted', role: 'status' }, saveNote),
      h('p', { class: 'muted' }, PRIVACY),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', id: 'again' }, 'Try again'),
        following && count ? h('a', { class: 'btn btn-primary', href: lessonUrl(skill.id, following.id) }, 'Next lesson') : '',
        back(), retry),
    );
    document.getElementById('again').addEventListener('click', () => {
      step = 'prompt'; index = 0; recorded = lesson.prompts.map(() => false); checks = lesson.prompts.map(() => 0); saveNote = ''; result = null; render();
    });
    document.getElementById('retrySave')?.addEventListener('click', () => persist(result));
  }

  function render() {
    if (step === 'prepare') renderPrepare();
    else if (step === 'prompt') renderPrompt();
    else renderResults();
  }
  render();
}
