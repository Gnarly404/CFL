import { ROUTES } from '@/core/routes.js';
import { lessonUrl } from '@/practice/content.js';
import { basicChecks, countWords } from '@/practice/writing.js';
import { segments } from '@/review/feedback.js';
import { createDraft, loadFeedback, loadLessonProgress, loadSubmission, saveLessonResult, submitDraft, updateDraft } from '@/services/practice-service.js';
import { h } from '@/ui/h.js';

const AUTOSAVE_MS = 2000;

/**
 * Writing practice. Drafts are saved separately from submitted work; once submitted the text can no longer be
 * changed, and nothing here ever rewrites what the student wrote.
 */
export async function runWriting({ stage, lesson, skill, uid, following, tracker }) {
  const cfg = lesson.writing;
  const show = (...nodes) => { stage.replaceChildren(...nodes); document.getElementById('stageHeading')?.focus(); };
  const back = () => h('a', { class: 'btn', href: ROUTES.practice }, 'Back to English Practice');
  const target = `Target: ${cfg.minWords} to ${cfg.maxWords} words (minimum ${cfg.minWords}).`;

  let existing = null;
  try {
    existing = await loadSubmission(uid, cfg.promptId);
  } catch (error) {
    console.warn('Could not load submission', error?.code ?? error);
    show(h('h1', { id: 'stageHeading', tabindex: '-1' }, cfg.topic),
      h('p', { class: 'form-note', role: 'alert' }, 'Your saved writing could not be loaded, so editing is turned off to protect it. Check your connection and reload the page.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'reload' }, 'Reload'), back()));
    document.getElementById('reload').addEventListener('click', () => window.location.reload());
    return;
  }
  let progress = {};
  try { progress = await loadLessonProgress(uid, skill.id); } catch (error) { console.warn('Could not load progress', error?.code ?? error); }

  const checksList = (text) => h('ul', { class: 'check-list' }, ...basicChecks(text).map((c) => h('li', { class: c.ok ? 'is-ok' : 'is-note' }, h('span', { 'aria-hidden': 'true' }, c.ok ? '✓ ' : '• '), c.text)));
  const checksBox = (text) => h('section', { class: 'passage' }, h('h2', {}, 'Basic checks'), h('p', { class: 'muted' }, 'These simple checks are not a grammar review. Your text is never changed for you.'), checksList(text));

  function renderSubmitted(record, note = '', feedback = null, feedbackFailed = false) {
    const text = record.content;
    const parts = feedback ? segments(text, feedback.notes ?? []) : null;
    show(
      h('p', { class: 'step-meta' }, 'Writing practice · Submitted'),
      h('h1', { id: 'stageHeading', tabindex: '-1' }, cfg.topic),
      h('p', {}, `${countWords(text)} words. Your writing has been submitted and can no longer be edited.${feedback ? '' : ' No teacher feedback yet.'}`),
      h('blockquote', { class: 'submitted-text' }, ...(parts ?? [{ text, note: null }]).map((part) => (part.note === null ? part.text : h('mark', { title: `Note ${part.note + 1}` }, part.text, h('sup', {}, part.note + 1))))),
      feedback ? h('section', { class: 'passage teacher-feedback' }, h('h2', {}, 'Teacher feedback'),
        feedback.overall ? h('p', {}, feedback.overall) : '',
        (feedback.notes ?? []).length ? h('ol', {}, ...feedback.notes.map((n) => h('li', {}, n.quote ? h('strong', {}, `“${n.quote}” `) : '', n.note))) : '') : '',
      feedbackFailed ? h('p', { class: 'muted', role: 'status' }, 'Teacher feedback could not be loaded right now. Reload to try again.') : '',
      checksBox(text),
      note ? h('p', { class: 'muted', role: 'status' }, note) : '',
      h('div', { class: 'actions' }, following ? h('a', { class: 'btn btn-primary', href: lessonUrl(skill.id, following.id) }, 'Next lesson') : '', back()),
    );
  }

  if (existing?.status === 'submitted') {
    let feedback = null;
    let feedbackFailed = false;
    try { feedback = await loadFeedback(uid, `${uid}_${cfg.promptId}`); } catch (error) { feedbackFailed = true; console.warn('Could not load feedback', error?.code ?? error); }
    renderSubmitted(existing, '', feedback, feedbackFailed);
    return;
  }

  let savedContent = existing ? existing.content : null;
  let saving = false;
  let queued = false;
  let timer = null;
  let confirming = false;

  const textarea = h('textarea', { id: 'writingText', rows: 12, 'aria-describedby': 'wordCount', class: 'writing-box' });
  textarea.value = existing?.content ?? '';
  const count = h('p', { id: 'wordCount', class: 'muted' });
  const status = h('p', { id: 'saveStatus', class: 'muted', role: 'status' }, existing ? 'Draft loaded.' : 'Nothing saved yet.');
  const checksHolder = h('div', {});
  const saveBtn = h('button', { class: 'btn', type: 'button' }, 'Save draft');
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Submit');
  const cancelBtn = h('button', { class: 'btn', type: 'button' }, 'Keep editing');
  cancelBtn.hidden = true;
  const warning = h('p', { class: 'form-note', role: 'alert' });
  warning.hidden = true;

  const dirty = () => textarea.value !== savedContent;
  const beforeUnload = (event) => { if (dirty() && textarea.value.trim()) { event.preventDefault(); } };
  window.addEventListener('beforeunload', beforeUnload);

  function refresh() {
    const text = textarea.value;
    const words = countWords(text);
    count.textContent = `${words} / ${cfg.minWords} words${words > cfg.maxWords ? ' (a little over the target is fine)' : ''}`;
    checksHolder.replaceChildren(text.trim() ? checksBox(text) : '');
    saveBtn.disabled = !text.trim() || saving;
    submitBtn.disabled = words < cfg.minWords || saving;
    submitBtn.title = words < cfg.minWords ? `Write at least ${cfg.minWords - words} more words to submit.` : '';
  }

  async function save() {
    clearTimeout(timer);
    if (saving) { queued = true; return true; }
    const text = textarea.value;
    if (!text.trim() || text === savedContent) return true;
    saving = true;
    status.textContent = 'Saving…';
    refresh();
    let ok = true;
    try {
      if (existing) await updateDraft(uid, cfg.promptId, text);
      else { await createDraft(uid, { skill: skill.id, lessonId: lesson.id, promptId: cfg.promptId, content: text }); existing = { status: 'draft' }; }
      savedContent = text;
      status.textContent = `Draft saved at ${new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}.`;
    } catch (error) {
      ok = false;
      console.warn('Could not save draft', error?.code ?? error);
      status.textContent = 'Your draft could not be saved. Your text is still here. Try Save draft again.';
    }
    saving = false;
    refresh();
    if (queued) { queued = false; return save(); }
    return ok;
  }

  function setConfirming(on) {
    confirming = on;
    submitBtn.textContent = on ? 'Confirm submit' : 'Submit';
    cancelBtn.hidden = !on;
    warning.hidden = !on;
    warning.textContent = on ? 'Once submitted, you cannot edit this writing. Press Confirm submit to continue.' : '';
  }

  async function submit() {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    const text = textarea.value;
    if (!(await save()) || dirty()) return;
    saving = true;
    refresh();
    try {
      await submitDraft(uid, cfg.promptId, text);
    } catch (error) {
      saving = false;
      console.warn('Could not submit', error?.code ?? error);
      status.textContent = 'Your writing could not be submitted. Your draft is safe. Try again.';
      refresh();
      return;
    }
    saving = false;
    window.removeEventListener('beforeunload', beforeUnload);
    let note = 'Submitted.';
    try {
      await saveLessonResult(uid, skill.id, lesson.id, { percent: null, mistakes: [], extra: { wordCount: countWords(text) } }, progress[lesson.id]);
    } catch (error) {
      console.warn('Could not save progress', error?.code ?? error);
      note = 'Submitted. Your lesson progress could not be updated; it will update next time.';
    }
    await tracker?.complete();
    renderSubmitted({ content: text }, note);
  }

  textarea.addEventListener('input', () => {
    if (confirming) setConfirming(false);
    status.textContent = textarea.value === savedContent ? status.textContent : 'Unsaved changes.';
    refresh();
    clearTimeout(timer);
    timer = setTimeout(save, AUTOSAVE_MS);
  });
  saveBtn.addEventListener('click', save);
  submitBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', () => setConfirming(false));

  show(
    h('p', { class: 'step-meta' }, 'Writing practice'),
    h('h1', { id: 'stageHeading', tabindex: '-1' }, cfg.topic),
    h('p', { class: 'muted' }, target),
    h('details', { class: 'context', open: true }, h('summary', {}, 'Plan your writing'),
      h('ul', { class: 'rule-list' }, ...cfg.structure.map((line) => h('li', {}, line))),
      h('p', { class: 'muted' }, 'Useful phrases:'),
      h('ul', { class: 'rule-list' }, ...cfg.phrases.map((phrase) => h('li', {}, phrase)))),
    h('label', { for: 'writingText', class: 'eyebrow' }, 'Your writing'),
    textarea, count, status, checksHolder, warning,
    h('div', { class: 'actions' }, saveBtn, submitBtn, cancelBtn, back()),
  );
  refresh();
}
