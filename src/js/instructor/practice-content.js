import { getSkillContent, loadPracticeContent } from '@/practice/content.js';
import { savePracticeContent } from '@/services/instructor-service.js';
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

function renderScalar(parent, key, value, path, state) {
  const id = `curriculum-${path.map(String).join('-')}`;
  const fieldKey = typeof path.at(-1) === 'number' ? path.at(-2) : key;
  const isNumber = typeof value === 'number' || key === 'answer';
  const shownValue = key === 'answer' ? String(Number(value) + 1) : String(value ?? '');
  const label = el('label', { for: id }, labelFor(key));
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
  parent.append(el('div', { class: 'curriculum-field' }, label, input));
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
  if (path.length) {
    const last = path.at(-1);
    const key = typeof last === 'number' ? path.at(-2) : last;
    container = el('fieldset', { class: 'curriculum-group' }, el('legend', {}, labelFor(key)));
    parent.append(container);
  }
  for (const [key, fieldValue] of Object.entries(value)) {
    const fieldPath = [...path, key];
    if (Array.isArray(fieldValue)) renderArray(container, key, fieldValue, fieldPath, state);
    else if (fieldValue && typeof fieldValue === 'object') renderObject(container, fieldValue, fieldPath, state);
    else renderScalar(container, key, fieldValue, fieldPath, state);
  }
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

  section.hidden = false;
  addButton.disabled = true;
  const show = (text, kind = 'info') => showMessage(note, text, kind);
  const curricula = new Map();
  let current;

  function loadSkill() {
    if (!curricula.has(skill.value)) {
      const content = getSkillContent(skill.value);
      curricula.set(skill.value, { skillId: skill.value, lessons: clone(content.lessons ?? []), selected: 0, dirty: false });
    }
    current = curricula.get(skill.value);
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
    }, `${index + 1}. ${lesson.title || 'Untitled lesson'}`))));

    const lesson = current.lessons[current.selected];
    removeButton.disabled = !lesson;
    fields.replaceChildren();
    if (!lesson) {
      fields.append(el('p', { class: 'muted' }, 'No lessons in this skill yet.'));
      return;
    }
    const state = {
      skillId: current.skillId,
      lesson,
      show,
      render,
      onChange() {
        current.dirty = true;
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
    current.dirty = true;
    show('New lesson added. Complete its fields, then save the curriculum.', 'info');
    render();
  });
  removeButton.addEventListener('click', () => {
    const lesson = current.lessons[current.selected];
    if (!lesson || !window.confirm(`Delete “${lesson.title || 'Untitled lesson'}” from ${SKILL_LABELS[current.skillId]}?`)) return;
    current.lessons.splice(current.selected, 1);
    current.selected = Math.min(current.selected, current.lessons.length - 1);
    current.dirty = true;
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
      show(`Saved ${result.lessonCount} ${SKILL_LABELS[current.skillId].toLowerCase()} lessons.`, 'success');
    } catch (error) {
      show(error.message || 'The curriculum could not be saved.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  loadPracticeContent().then(loadSkill);
}