import fallbackProgrammes from '../../data/programmes.json';
import { el } from '@/utils/dom.js';
import { assignProgramme, listProgrammeStaff } from '@/services/admin-service.js';
import { listCatalog } from '@/services/programme-service.js';

/**
 * "Programme staff": which instructors teach each programme. Many-to-many, so a programme can list several
 * instructors and an instructor can appear on several programmes.
 */
export function initProgrammeStaff({ root = document, say, getUsers }) {
  const body = root.querySelector('#programmeStaffBody');
  if (!body) return { load() {} };
  const empty = (text) => el('tr', {}, el('td', { colspan: 3, class: 'empty' }, text));
  const label = (user) => user?.displayName || user?.email || 'Unknown account';

  async function change(programme, instructorId, assigned, name) {
    try {
      await assignProgramme({ programmeId: programme.id, instructorId, assigned });
      say(`${assigned ? 'Assigned' : 'Removed'} ${name} ${assigned ? 'to' : 'from'} ${programme.name}.`, 'success');
      await load();
    } catch (error) {
      say(error.message || 'That did not work. Try again.', 'error');
    }
  }

  async function load() {
    body.replaceChildren(empty('Loading programmes…'));
    let staff;
    try {
      staff = await listProgrammeStaff();
    } catch (error) {
      body.replaceChildren(empty('Programme staff could not be loaded.'));
      say(error.message || 'Programme staff could not be loaded.', 'error');
      return;
    }
    const users = getUsers();
    const byId = new Map(users.map((u) => [u.uid, u]));
    const instructors = users.filter((u) => u.role === 'instructor' && u.status !== 'disabled');
    let programmes = fallbackProgrammes;
    try {
      programmes = await listCatalog();
    } catch (error) {
      console.warn('Could not load the programme catalogue', error?.code ?? error);
    }

    body.replaceChildren(...programmes.map((programme) => {
      const ids = staff.get(programme.id) ?? [];
      const free = instructors.filter((i) => !ids.includes(i.uid));
      const select = el('select', { class: 'form-select form-select-sm', 'aria-label': `Instructor to assign to ${programme.name}` },
        el('option', { value: '' }, free.length ? 'Choose an instructor…' : 'No other instructors'),
        ...free.map((i) => el('option', { value: i.uid }, label(i))));
      select.disabled = !free.length;
      const add = el('button', {
        type: 'button', class: 'btn btn-sm btn-primary',
        onclick: () => { if (select.value) change(programme, select.value, true, label(byId.get(select.value))); },
      }, 'Assign');
      return el('tr', {},
        el('td', {}, el('strong', {}, programme.name), el('br'), el('small', {}, programme.category ?? '')),
        el('td', {}, ids.length
          ? el('ul', { class: 'list-unstyled mb-0' }, ...ids.map((id) => {
            const user = byId.get(id);
            return el('li', {}, `${label(user)} `, el('button', {
              type: 'button', class: 'btn btn-sm btn-outline-secondary',
              'aria-label': `Remove ${label(user)} from ${programme.name}`,
              onclick: () => { if (window.confirm(`Remove ${label(user)} from ${programme.name}? They will no longer be able to schedule classes for it.`)) change(programme, id, false, label(user)); },
            }, 'Remove'));
          }))
          : el('span', { class: 'text-muted' }, 'No instructor yet')),
        el('td', { class: 'actions' }, select, add));
    }));
  }

  return { load };
}
