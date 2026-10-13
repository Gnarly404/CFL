import { getSkillContent, loadPracticeContent } from '@/practice/content.js';
import { savePracticeContent } from '@/services/instructor-service.js';
import { icon } from '@/ui/icons.js';
import { el, setBusy, showMessage } from '@/utils/dom.js';

const SKILL_LABELS = {
  grammar: 'Grammar', vocabulary: 'Vocabulary', reading: 'Reading',
  listening: 'Listening', speaking: 'Speaking', writing: 'Writing',
};
const LONG_FIELDS = new Set(['summary', 'prompt', 'why', 'text', 'topic', 'definition', 'example', 'rule', 'note', 'paragraphs', 'phrases', 'structure']);
const FIELD_LABELS = {
  id: 'ID', minWords: 'Minimum words', maxWords: 'Maximum words',
  answer: 'Correct option number (starts at 1)', lang: 'Language code',
};
const clone = (value) => structuredClone(value);
const labelFor = (key) => FIELD_LABELS[key] ?? String(key).replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function blankLesson(skillId, ordinal) {
  const lesson = { id: `${skillId}-lesson-${Date.now()}-${ordinal}`, title: '', summary: '' };
  if (skillId === 'grammar') Object.assign(lesson, { rule: [''], examples: [{ text: '', note: '' }], questions: [] });
  if (skillId === 'vocabulary') Object.assign(lesson, { words: [{ word: '', definition: '', example: '' }], questions: [] });
  if (skillId === 'reading') Object.assign(lesson, { passage: { title: '', paragraphs: [''] }, questions: [] });
  if (skillId === 'listening') Object.assign(lesson, { listening: { lang: 'en-GB', text: '' }, questions: [] });
  if (skillId === 'speaking') Object.assign(lesson, { phrases: [''], prompts: [{ id: '', text: '' }] });
  if (skillId === 'writing') Object.assign(lesson, {
    writing: { promptId: `${skillId}-prompt-${Date.now()}`, topic: '', minWords: 1, maxWords: 100, structure: [''], phrases: [''] },
  });
  return lesson;
}

function newArrayItem(path, values, state) {
  const key = path.at(-1);
  if (key === 'examples') return { text: '', note: '' };
  if (key === 'words') return { word: '', definition: '', example: '' };
  if (key === 'questions') {
    const question = {
      id: `${state.lesson.id}-question-${Date.now()}`,
      prompt: '', options: ['Option 1', 'Option 2'], answer: 0, why: '',
    };
    if (state.skillId === 'vocabulary') question.word = '';
    return question;
  }
  if (key === 'prompts') return { id: `${state.lesson.id}-prompt-${Date.now()}`, text: '' };
  if (key === 'options') return `Option ${values.length + 1}`;
  return '';
}

function minArrayLength(path) {
  const key = path.at(-1);
  return ['rule', 'examples', 'words', 'paragraphs', 'phrases', 'structure', 'prompts'].includes(key) ? 1
    : key === 'options' ? 2 : 0;
}

function setAtPath(target, path, value) {
  let parent = target;
  for (const key of path.slice(0, -1)) parent = parent[key];
  parent[path.at(-1)] = value;
}

function summaryOf(item, index) {
  const text = item.title || item.word || item.prompt || item.text || item.id;
  return text ? `${index + 1}. ${text}` : `Item ${index + 1}`;
}

/** A multiple-choice question: options plus the index of the right one. */
const isQuestion = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && Array.isArray(value.options) && typeof value.answer === 'number';

function lessonMeta(lesson) {
  const parts = [];
  if (Array.isArray(lesson.questions)) parts.push(plural(lesson.questions.length, 'question'));
  if (Array.isArray(lesson.words)) parts.push(plural(lesson.words.length, 'word'));
  if (Array.isArray(lesson.prompts)) parts.push(plural(lesson.prompts.length, 'prompt'));
  if (lesson.writing) parts.push('Writing task');
  return parts.join(' · ') || 'No exercises yet';
}

function renderScalar(parent, key, value, path, state) {
  const id = `curriculum-${path.map(String).join('-')}`;
  const fieldKey = typeof path.at(-1) === 'number' ? path.at(-2) : key;
  const isNumber = typeof value === 'number' || key === 'answer';
  const shownValue = key === 'answer' ? String(Number(value) + 1) : String(value ?? '');
  const label = el('label', { for: id }, /\s/.test(key) ? key : labelFor(key)); // "Item 1" is already a label
  let input;
  if (LONG_FIELDS.has(fieldKey)) {
    input = el('textarea', { id, class: 'form-control', rows: fieldKey === 'summary' ? 2 : 3, 'data-path': JSON.stringify(path) }, shownValue);
  } else {
    input = el('input', {
      id,
      class: 'form-control',
      type: isNumber ? 'number' : 'text',
      ...(isNumber ? { min: key === 'answer' ? 1 : 0, step: 1 } : {}),
      'data-path': JSON.stringify(path),
    });
    input.value = shownValue;
  }
  input.addEventListener('input', () => {
    let next = isNumber ? Number(input.value) : input.value;
    if (key === 'answer') next = Math.max(0, next - 1);
    setAtPath(state.lesson, path, next);
    state.onChange();
  });
  parent.append(el('div', { class: `curriculum-field${key === 'id' ? ' curriculum-field--id' : ''}` }, label, input));
}

/** Answer options with a radio button beside each: choosing it sets the question's `answer` index. */
function renderOptions(parent, question, path, state) {
  const { options } = question;
  const group = el('fieldset', { class: 'curriculum-collection curriculum-options' }, el('legend', {}, 'Answer options'),
    el('p', { class: 'curriculum-hint' }, 'Choose the radio button beside the correct answer.'));
  const name = `correct-${question.id ?? path.map(String).join('-')}`;
  options.forEach((text, index) => {
    const radio = el('input', { type: 'radio', name, value: String(index), 'aria-label': `Option ${index + 1} is the correct answer` });
    radio.checked = question.answer === index;
    radio.addEventListener('change', () => {
      question.answer = index;
      state.onChange();
    });
    const input = el('input', {
      class: 'form-control', type: 'text', 'aria-label': `Option ${index + 1}`, 'data-path': JSON.stringify([...path, index]),
    });
    input.value = String(text ?? '');
    input.addEventListener('input', () => {
      options[index] = input.value;
      state.onChange();
    });
    const remove = el('button', {
      type: 'button',
      class: 'btn btn-sm btn-outline-secondary',
      'aria-label': `Remove option ${index + 1}`,
      onclick: () => {
        if (options.length <= minArrayLength(path)) {
          state.show('A question needs at least 2 options.', 'error');
          return;
        }
        options.splice(index, 1);
        if (question.answer === index) question.answer = 0;
        else if (question.answer > index) question.answer -= 1;
        state.onChange();
        state.render();
      },
    }, 'Remove');
    group.append(el('div', { class: 'curriculum-option' }, el('label', { class: 'curriculum-correct' }, radio, el('span', { class: 'curriculum-correct-mark' })), input, remove));
  });
  group.append(el('button', {
    type: 'button',
    class: 'btn btn-sm btn-outline-secondary',
    onclick: () => {
      options.push(newArrayItem(path, options, state));
      state.onChange();
      state.render();
    },
  }, 'Add option'));
  parent.append(group);
}

function renderArray(parent, key, values, path, state) {
  const section = el('fieldset', { class: 'curriculum-collection' }, el('legend', {}, labelFor(key)));
  values.forEach((item, index) => {
    const row = el('div', { class: 'curriculum-row' });
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const details = el('details', { class: 'curriculum-item' });
      details.open = index === 0;
      const body = el('div', { class: 'curriculum-item-body' });
      details.append(el('summary', {}, summaryOf(item, index)), body);
      renderObject(body, item, [...path, index], state);
      row.append(details);
    } else {
      renderScalar(row, `Item ${index + 1}`, item, [...path, index], state);
    }
    row.append(el('button', {
      type: 'button', class: 'btn btn-sm btn-outline-secondary',
      'aria-label': `Remove ${labelFor(key)} item ${index + 1}`,
      onclick: () => {
        const minimum = minArrayLength(path);
        if (values.length <= minimum) {
          state.show(`Keep at least ${minimum} ${labelFor(key).toLowerCase()} item${minimum === 1 ? '' : 's'}.`, 'error');
          return;
        }
        values.splice(index, 1);
        state.onChange();
        state.render();
      },
    }, 'Remove'));
    section.append(row);
  });
  section.append(el('button', {
    type: 'button', class: 'btn btn-sm btn-outline-secondary',
    onclick: () => {
      values.push(newArrayItem(path, values, state));
      state.onChange();
      state.render();
    },
  }, `Add ${labelFor(key).toLowerCase()}`));
  parent.append(section);
}

function renderObject(parent, value, path, state) {
  let container = parent;
  // The lesson's own plain fields (id, title, summary) sit together in one card above its groups.
  const basics = path.length === 0 ? el('div', { class: 'curriculum-basics' }) : null;
  if (typeof path.at(-1) === 'number') {
    // An item in a list already has its own heading (the details summary), so it needs no second frame.
  } else if (path.length) {
    container = el('fieldset', { class: 'curriculum-group' }, el('legend', {}, labelFor(path.at(-1))));
    parent.append(container);
  } else {
    parent.append(basics);
  }
  const question = isQuestion(value);
  for (const [key, fieldValue] of Object.entries(value)) {
    const fieldPath = [...path, key];
    if (question && key === 'answer') continue; // chosen with the radio buttons beside the options
    if (question && key === 'options') renderOptions(container, value, fieldPath, state);
    else if (Array.isArray(fieldValue)) renderArray(container, key, fieldValue, fieldPath, state);
    else if (fieldValue && typeof fieldValue === 'object') renderObject(container, fieldValue, fieldPath, state);
    else renderScalar(basics ?? container, key, fieldValue, fieldPath, state);
  }
  if (basics && !basics.children.length) basics.remove();
}

export function initPracticeContentEditor({ root = document } = {}) {
  const section = root.querySelector('#practice-curriculum');
  const form = root.querySelector('#practiceContentForm');
  const skill = root.querySelector('#practiceSkill');
  const lessonList = root.querySelector('#practiceLessonList');
  const fields = root.querySelector('#practiceLessonFields');
  const note = root.querySelector('#practiceContentNote');
  const addButton = root.querySelector('#addPracticeLesson');
  const removeButton = root.querySelector('#deletePracticeLesson');
  if (!section || !form || !skill || !lessonList || !fields || !note || !addButton || !removeButton) return;

  const tabs = root.querySelector('#practiceSkillTabs');
  const panel = root.querySelector('#practiceStudioPanel');
  section.hidden = false;
  addButton.disabled = true;
  const show = (text, kind = 'info') => showMessage(note, text, kind);
  const curricula = new Map();
  let current;

  const anyUnsaved = () => [...curricula.values()].some((entry) => entry.dirty);
  const lessonCount = (skillId) => {
    const open = curricula.get(skillId);
    if (open) return open.lessons.length;
    try { return getSkillContent(skillId)?.lessons?.length ?? 0; } catch { return 0; }
  };

  // ---- skill tabs (the hidden <select> stays the single source of truth, so nothing else changes)
  function syncTabs() {
    if (!tabs) return;
    tabs.querySelectorAll('[role="tab"]').forEach((tab) => {
      const id = tab.dataset.skill;
      const selected = id === skill.value;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.querySelector('.studio-count').textContent = String(lessonCount(id));
      const unsaved = Boolean(curricula.get(id)?.dirty);
      tab.toggleAttribute('data-dirty', unsaved);
      tab.querySelector('.studio-unsaved').textContent = unsaved ? ' (unsaved changes)' : '';
      if (selected && panel) panel.setAttribute('aria-labelledby', tab.id);
    });
  }

  function choose(skillId) {
    if (skill.value === skillId) return;
    skill.value = skillId;
    skill.dispatchEvent(new Event('change'));
  }

  function buildTabs() {
    if (!tabs) return;
    tabs.replaceChildren(...[...skill.options].map((option) => {
      const id = option.value;
      let glyph = '';
      try { glyph = icon(id, { size: 18 }); } catch { /* a skill without an icon still gets a tab */ }
      return el('button', {
        type: 'button', role: 'tab', id: `practiceTab-${id}`, class: 'studio-tab', 'data-skill': id, 'data-glide-item': '', 'aria-selected': 'false', 'aria-controls': panel ? 'practiceStudioPanel' : null, tabindex: '-1',
        onclick: () => choose(id),
      }, glyph, el('span', { class: 'studio-tab-label' }, option.textContent.trim()), el('span', { class: 'studio-count' }, ''), el('span', { class: 'visually-hidden studio-unsaved' }, ''));
    }));
    tabs.addEventListener('keydown', (event) => {
      const all = [...tabs.querySelectorAll('[role="tab"]')];
      const at = all.findIndex((tab) => tab.dataset.skill === skill.value);
      const target = { ArrowRight: (at + 1) % all.length, ArrowLeft: (at - 1 + all.length) % all.length, Home: 0, End: all.length - 1 }[event.key];
      if (target == null) return;
      event.preventDefault();
      choose(all[target].dataset.skill);
      all[target].focus();
    });
    (skill.closest('.curriculum-skill-picker') ?? skill).hidden = true;
  }

  function markDirty() {
    current.dirty = true;
    form.dataset.dirty = 'true';
    syncTabs();
  }

  function loadSkill() {
    if (!curricula.has(skill.value)) {
      const content = getSkillContent(skill.value);
      curricula.set(skill.value, { skillId: skill.value, lessons: clone(content.lessons ?? []), selected: 0, dirty: false });
    }
    current = curricula.get(skill.value);
    form.dataset.dirty = String(current.dirty);
    show(current.dirty ? 'Unsaved changes for this skill.' : '');
    addButton.disabled = false;
    render();
  }

  function render() {
    if (!current) return;
    lessonList.replaceChildren(...current.lessons.map((lesson, index) => el('li', {}, el('button', {
      type: 'button',
      class: index === current.selected ? 'is-current' : '',
      'aria-pressed': String(index === current.selected),
      onclick: () => {
        current.selected = index;
        show(current.dirty ? 'Unsaved changes for this skill.' : '');
        render();
      },
    }, el('span', { class: 'lesson-num' }, String(index + 1)),
    el('span', { class: 'lesson-text' }, el('span', { class: 'lesson-title' }, lesson.title || 'Untitled lesson'), el('span', { class: 'lesson-meta' }, lessonMeta(lesson)))))));

    const lesson = current.lessons[current.selected];
    removeButton.disabled = !lesson;
    fields.replaceChildren();
    syncTabs();
    if (!lesson) {
      fields.append(el('p', { class: 'empty-state' }, 'No lessons in this skill yet. Choose Add lesson to write the first one.'));
      return;
    }
    const state = {
      skillId: current.skillId,
      lesson,
      show,
      render,
      onChange() {
        markDirty();
        show('Unsaved changes. Save curriculum to publish them.', 'info');
      },
    };
    renderObject(fields, lesson, [], state);
  }

  skill.addEventListener('change', loadSkill);
  addButton.addEventListener('click', () => {
    const lesson = blankLesson(current.skillId, current.lessons.length + 1);
    current.lessons.push(lesson);
    current.selected = current.lessons.length - 1;
    markDirty();
    show('New lesson added. Complete its fields, then save the curriculum.', 'info');
    render();
  });
  removeButton.addEventListener('click', () => {
    const lesson = current.lessons[current.selected];
    if (!lesson || !window.confirm(`Delete “${lesson.title || 'Untitled lesson'}” from ${SKILL_LABELS[current.skillId]}?`)) return;
    current.lessons.splice(current.selected, 1);
    current.selected = Math.min(current.selected, current.lessons.length - 1);
    markDirty();
    show('Lesson removed. Save curriculum to publish the deletion.', 'info');
    render();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Saving…');
    try {
      const content = { skill: current.skillId, lessons: current.lessons };
      const result = await savePracticeContent({ skillId: current.skillId, content });
      current.dirty = false;
      form.dataset.dirty = 'false';
      syncTabs();
      show(`Saved ${result.lessonCount} ${SKILL_LABELS[current.skillId].toLowerCase()} lessons.`, 'success');
    } catch (error) {
      show(error.message || 'The curriculum could not be saved.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  // Leaving the page with unsaved lessons asks first, so a stray click never throws work away.
  window.addEventListener('beforeunload', (event) => {
    if (!anyUnsaved()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  buildTabs();
  syncTabs();
  loadPracticeContent().then(loadSkill);
}
