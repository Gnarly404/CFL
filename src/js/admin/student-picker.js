import { el } from '@/utils/dom.js';

/**
 * Choosing a student by typing their name or number. One shared <datalist> serves every picker on the page,
 * so a statement with hundreds of rows does not build hundreds of option lists.
 */
const LIST_ID = 'studentOptions';

export const studentLabel = (student) => {
  const name = student.displayName || student.email || 'Unnamed student';
  const detail = student.studentNumber || student.email || '';
  return detail && detail !== name ? `${name} (${detail})` : name;
};

/** Keeps the datalist and the label to student lookups in step with the student list. */
export function createStudentOptions() {
  const list = el('datalist', { id: LIST_ID });
  document.body.append(list);
  let byLabel = new Map();
  let labelOf = new Map();
  return {
    listId: LIST_ID,
    update(students) {
      byLabel = new Map();
      labelOf = new Map();
      const options = [];
      for (const student of students) {
        let text = studentLabel(student);
        // Two students with the same name and no number would look identical: tell them apart.
        if (byLabel.has(text)) text = `${text} · ${student.uid.slice(0, 4)}`;
        byLabel.set(text, student.uid);
        labelOf.set(student.uid, text);
        options.push(el('option', { value: text }));
      }
      list.replaceChildren(...options);
    },
    /** @returns {string|null|undefined} the uid, null for an empty box, undefined for text that is no student */
    resolve(text) {
      const value = String(text ?? '').trim();
      if (!value) return null;
      return byLabel.get(value);
    },
    labelFor: (uid) => labelOf.get(uid) ?? '',
  };
}

/** A text box that takes a student's label. `onChange` receives the uid, null (nobody) or undefined (not a student). */
export function studentInput(options, { id, value = '', label, onChange } = {}) {
  const input = el('input', {
    type: 'text', class: 'form-control', id, list: options.listId, autocomplete: 'off', placeholder: 'Type a name or number', 'aria-label': label,
  });
  input.value = value ? options.labelFor(value) : '';
  input.addEventListener('change', () => {
    const uid = options.resolve(input.value);
    input.classList.toggle('is-invalid', uid === undefined);
    input.title = uid === undefined ? 'Choose a student from the list.' : '';
    onChange?.(uid);
  });
  return input;
}
