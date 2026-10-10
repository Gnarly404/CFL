import { el } from '@/utils/dom.js';
import { assignInstructor, listStudents } from '@/services/admin-service.js';

/**
 * "Teaching assignments": which instructors can see each student's submitted writing.
 * `users` is the account list the dashboard already loaded (names, emails, roles).
 */
export function initAssignments({ root = document, say, getUsers }) {
  const body = root.querySelector('#assignmentsBody');
  if (!body) return { load() {} };
  const empty = (text) => el('tr', {}, el('td', { colspan: 3, class: 'empty' }, text));
  const label = (user) => user?.displayName || user?.email || 'Unknown account';

  async function change(studentId, instructorId, assigned, name) {
    try {
      await assignInstructor({ studentId, instructorId, assigned });
      say(`${assigned ? 'Assigned' : 'Removed'} ${name}.`, 'success');
      await load();
    } catch (error) {
      say(error.message || 'That did not work. Try again.', 'error');
    }
  }

  async function load() {
    body.replaceChildren(empty('Loading students…'));
    let students;
    try {
      students = await listStudents();
    } catch (error) {
      body.replaceChildren(empty('Students could not be loaded.'));
      say(error.message || 'Students could not be loaded.', 'error');
      return;
    }
    const users = getUsers();
    const byId = new Map(users.map((u) => [u.uid, u]));
    const instructors = users.filter((u) => u.role === 'instructor' && u.status !== 'disabled');
    if (!students.length) { body.replaceChildren(empty('No students yet.')); return; }

    body.replaceChildren(...students.map((student) => {
      const info = byId.get(student.uid);
      const assigned = student.instructorIds.map((id) => ({ id, user: byId.get(id) }));
      const free = instructors.filter((i) => !student.instructorIds.includes(i.uid));
      const select = el('select', { class: 'form-select form-select-sm', 'aria-label': `Instructor to assign to ${label(info)}` },
        el('option', { value: '' }, free.length ? 'Choose an instructor…' : 'No other instructors'),
        ...free.map((i) => el('option', { value: i.uid }, label(i))));
      select.disabled = !free.length;
      const add = el('button', {
        type: 'button', class: 'btn btn-sm btn-primary',
        onclick: () => { if (select.value) change(student.uid, select.value, true, label(byId.get(select.value))); },
      }, 'Assign');
      return el('tr', {},
        el('td', {}, el('strong', {}, label(info)), el('br'), el('small', {}, info?.email ?? student.uid)),
        el('td', {}, assigned.length
          ? el('ul', { class: 'list-unstyled mb-0' }, ...assigned.map(({ id, user }) => el('li', {},
            `${label(user)} `,
            el('button', {
              type: 'button', class: 'btn btn-sm btn-outline-secondary',
              'aria-label': `Remove ${label(user)} from ${label(info)}`,
              onclick: () => { if (window.confirm(`Remove ${label(user)} from ${label(info)}? They will no longer see this student's submitted writing.`)) change(student.uid, id, false, label(user)); },
            }, 'Remove'))))
          : el('span', { class: 'text-muted' }, 'No instructor yet')),
        el('td', { class: 'actions' }, select, add));
    }));
  }

  return { load };
}
