import fallbackProgrammes from '../../data/programmes.json';
import { el } from '@/utils/dom.js';
import { describeWhen, formatDay, modeLabel } from './state.js';
import { buildClass } from './validate.js';
import { listCatalog } from '@/services/programme-service.js';
import { createClass, listClasses, listMyProgrammeIds, manageScheduledClass } from '@/services/schedule-service.js';

/** Lets an instructor schedule and manage their own classes. */
export function initSchedule({ root = document, say, instructor }) {
  const form = root.querySelector('#classForm');
  const body = root.querySelector('#classesBody');
  if (!form || !body) return { load() {} };
  const field = (id) => form.querySelector(`#${id}`);
  const empty = (text) => el('tr', {}, el('td', { colspan: 4, class: 'empty' }, text));
  const programmeSelect = field('classProgramme');
  const instructors = [{ uid: instructor.uid, displayName: instructor.displayName }];
  let catalogue = fallbackProgrammes;
  const programmeName = (id) => catalogue.find((p) => p.id === id)?.name ?? id;

  const submitButton = form.querySelector('button[type="submit"]');
  const programmeNote = root.querySelector('#classProgrammeNote');

  /** Only programmes an administrator has assigned to this instructor can be scheduled. */
  async function loadProgrammes() {
    let ids = [];
    try {
      ids = await listMyProgrammeIds(instructor.uid);
    } catch (error) {
      console.warn('Could not load assigned programmes', error?.code ?? error);
      say('Your assigned programmes could not be loaded.', 'error');
    }
    try {
      catalogue = await listCatalog();
    } catch (error) {
      console.warn('Could not load the programme catalogue', error?.code ?? error);
      catalogue = fallbackProgrammes;
    }
    const byId = new Map(catalogue.map((p) => [p.id, p]));
    const mine = ids.map((id) => byId.get(id) ?? { id, name: id });
    programmeSelect.replaceChildren(
      el('option', { value: '' }, mine.length ? 'Choose a programme…' : 'No programmes assigned'),
      ...mine.map((p) => el('option', { value: p.id }, p.name)),
    );
    programmeSelect.disabled = !mine.length;
    if (submitButton) submitButton.disabled = !mine.length;
    if (programmeNote) {
      programmeNote.hidden = Boolean(mine.length);
      programmeNote.textContent = mine.length ? '' : 'You are not assigned to any programme yet. Ask an administrator to assign you before you schedule classes.';
    }
  }

  async function changeClass(scheduleClass, action) {
    try {
      await manageScheduledClass(scheduleClass.id, action);
      const messages = {
        cancel: 'Class cancelled. Students are being notified and it is removed from their schedules.',
        restore: 'Class restored. Students are being notified and it is back on their schedules.',
        delete: 'Class permanently deleted. Enrolled students are being notified.',
      };
      say(messages[action], 'success');
      await load();
    } catch (error) {
      say(error.message || 'That did not work. Try again.', 'error');
    }
  }

  async function load() {
    await loadProgrammes();
    body.replaceChildren(empty('Loading classes…'));
    let classes;
    try {
      classes = await listClasses({ instructorId: instructor.uid });
    } catch (error) {
      console.warn('Could not load classes', error?.code ?? error);
      body.replaceChildren(empty('Classes could not be loaded.'));
      say('Classes could not be loaded.', 'error');
      return;
    }
    if (!classes.length) { body.replaceChildren(empty('No classes scheduled yet.')); return; }
    body.replaceChildren(...classes.map((scheduleClass) => {
      const actions = [];
      actions.push(el('button', {
        type: 'button', class: 'btn btn-sm btn-outline-secondary',
        'aria-label': `${scheduleClass.cancelled ? 'Restore' : 'Cancel'} ${scheduleClass.title}`,
        onclick: () => {
          const action = scheduleClass.cancelled ? 'restore' : 'cancel';
          if (action === 'restore' || window.confirm(`Cancel "${scheduleClass.title}"? Students will be notified and it will be removed from their schedules.`)) {
            changeClass(scheduleClass, action);
          }
        },
      }, scheduleClass.cancelled ? 'Restore' : 'Cancel'));
      actions.push(el('button', {
        type: 'button', class: 'btn btn-sm btn-delete', 'aria-label': `Delete ${scheduleClass.title}`,
        onclick: () => {
          if (window.confirm(`Permanently delete "${scheduleClass.title}"? This cannot be undone.`)) changeClass(scheduleClass, 'delete');
        },
      }, 'Delete'));
      return el('tr', {},
      el('td', {}, el('strong', {}, formatDay(scheduleClass.startsAtMs)), el('br'), el('small', {}, describeWhen(scheduleClass))),
      el('td', {}, el('strong', {}, scheduleClass.title), el('br'), el('small', {}, `${programmeName(scheduleClass.programmeId)} · ${modeLabel(scheduleClass.mode)}${scheduleClass.instructorName ? ` · ${scheduleClass.instructorName}` : ''}`)),
      el('td', {}, scheduleClass.cancelled ? 'Cancelled' : 'Scheduled'),
      el('td', { class: 'actions' }, ...actions));
    }));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { errors, value } = buildClass({
      programmeId: field('classProgramme').value, title: field('classTitle').value, date: field('classDate').value,
      start: field('classStart').value, end: field('classEnd').value, mode: field('classMode').value,
      location: field('classLocation').value, joinLink: field('classLink').value, notes: field('classNotes').value,
      instructorId: instructor.uid,
    }, instructors);
    if (errors.length) { say(errors.join(' '), 'error'); return; }
    const button = submitButton;
    button.disabled = true;
    button.textContent = 'Adding…';
    try {
      await createClass(value);
      say('Class scheduled. Enrolled students are being notified.', 'success');
      form.reset();
      await load();
    } catch (error) {
      console.warn('Could not add the class', error?.code ?? error);
      say(error.message || 'The class could not be saved. Check the details and try again.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Add class';
    }
  });

  return { load };
}