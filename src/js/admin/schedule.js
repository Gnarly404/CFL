import programmes from '../../data/programmes.json';
import { el } from '@/utils/dom.js';
import { describeWhen, formatDay, modeLabel } from '@/schedule/state.js';
import { buildClass } from '@/schedule/validate.js';
import { createClass, listClasses, setClassCancelled } from '@/services/schedule-service.js';

const programmeName = (id) => programmes.find((p) => p.id === id)?.name ?? id;

/** "Class schedule": add classes for a programme and cancel or restore them. Students in that programme see them. */
export function initSchedule({ root = document, say, getUsers, adminUid }) {
  const form = root.querySelector('#classForm');
  const body = root.querySelector('#classesBody');
  if (!form || !body) return { load() {} };
  const field = (id) => form.querySelector(`#${id}`);
  const empty = (text) => el('tr', {}, el('td', { colspan: 4, class: 'empty' }, text));

  const programmeSelect = field('classProgramme');
  programmeSelect.replaceChildren(el('option', { value: '' }, 'Choose a programme…'), ...programmes.map((p) => el('option', { value: p.id }, p.name)));

  const instructors = () => getUsers().filter((u) => u.role === 'instructor' && u.status !== 'disabled');
  function fillInstructors() {
    const select = field('classInstructor');
    select.replaceChildren(el('option', { value: '' }, 'No instructor named'),
      ...instructors().map((u) => el('option', { value: u.uid }, u.displayName || u.email || u.uid)));
  }

  async function toggle(c) {
    try {
      await setClassCancelled(c.id, !c.cancelled);
      say(c.cancelled ? 'Class restored.' : 'Class cancelled. Students will see it marked as cancelled.', 'success');
      await load();
    } catch (error) {
      say(error.message || 'That did not work. Try again.', 'error');
    }
  }

  async function load() {
    fillInstructors();
    body.replaceChildren(empty('Loading classes…'));
    let list;
    try {
      list = await listClasses();
    } catch (error) {
      console.warn('Could not load classes', error?.code ?? error);
      body.replaceChildren(empty('Classes could not be loaded.'));
      say('Classes could not be loaded.', 'error');
      return;
    }
    if (!list.length) { body.replaceChildren(empty('No classes scheduled yet.')); return; }
    body.replaceChildren(...list.map((c) => el('tr', {},
      el('td', {}, el('strong', {}, formatDay(c.startsAtMs)), el('br'), el('small', {}, describeWhen(c))),
      el('td', {}, el('strong', {}, c.title), el('br'), el('small', {}, `${programmeName(c.programmeId)} · ${modeLabel(c.mode)}${c.instructorName ? ` · ${c.instructorName}` : ''}`)),
      el('td', {}, c.cancelled ? 'Cancelled' : 'Scheduled'),
      el('td', { class: 'actions' }, el('button', {
        type: 'button', class: 'btn btn-sm btn-outline-secondary', 'aria-label': `${c.cancelled ? 'Restore' : 'Cancel'} ${c.title}`,
        onclick: () => {
          if (c.cancelled || window.confirm(`Cancel "${c.title}"? Students in this programme will see it as cancelled.`)) toggle(c);
        },
      }, c.cancelled ? 'Restore' : 'Cancel')))));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { errors, value } = buildClass({
      programmeId: field('classProgramme').value, title: field('classTitle').value, date: field('classDate').value,
      start: field('classStart').value, end: field('classEnd').value, mode: field('classMode').value,
      location: field('classLocation').value, joinLink: field('classLink').value, notes: field('classNotes').value,
      instructorId: field('classInstructor').value,
    }, instructors());
    if (errors.length) { say(errors.join(' '), 'error'); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await createClass(value, adminUid);
      say('Class added. Students in that programme can see it now.', 'success');
      form.reset();
      await load();
    } catch (error) {
      console.warn('Could not add the class', error?.code ?? error);
      say('The class could not be saved. Check the details and try again.', 'error');
    }
    button.disabled = false;
  });

  return { load };
}
