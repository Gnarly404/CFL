import programmes from '../../data/programmes.json';
import { el } from '@/utils/dom.js';
import { describeWhen, formatDay, modeLabel } from './state.js';
import { buildClass } from './validate.js';
import { createClass, listClasses, setClassCancelled } from '@/services/schedule-service.js';

const programmeName = (id) => programmes.find((p) => p.id === id)?.name ?? id;

/** Lets an instructor schedule and manage their own classes. */
export function initSchedule({ root = document, say, instructor }) {
  const form = root.querySelector('#classForm');
  const body = root.querySelector('#classesBody');
  if (!form || !body) return { load() {} };
  const field = (id) => form.querySelector(`#${id}`);
  const empty = (text) => el('tr', {}, el('td', { colspan: 4, class: 'empty' }, text));
  const programmeSelect = field('classProgramme');
  const instructors = [{ uid: instructor.uid, displayName: instructor.displayName }];

  programmeSelect.replaceChildren(el('option', { value: '' }, 'Choose a programme…'), ...programmes.map((p) => el('option', { value: p.id }, p.name)));

  async function toggle(scheduleClass) {
    try {
      await setClassCancelled(scheduleClass.id, !scheduleClass.cancelled);
      say(scheduleClass.cancelled ? 'Class restored.' : 'Class cancelled. Students will see it marked as cancelled.', 'success');
      await load();
    } catch (error) {
      say(error.message || 'That did not work. Try again.', 'error');
    }
  }

  async function load() {
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
    body.replaceChildren(...classes.map((scheduleClass) => el('tr', {},
      el('td', {}, el('strong', {}, formatDay(scheduleClass.startsAtMs)), el('br'), el('small', {}, describeWhen(scheduleClass))),
      el('td', {}, el('strong', {}, scheduleClass.title), el('br'), el('small', {}, `${programmeName(scheduleClass.programmeId)} · ${modeLabel(scheduleClass.mode)}${scheduleClass.instructorName ? ` · ${scheduleClass.instructorName}` : ''}`)),
      el('td', {}, scheduleClass.cancelled ? 'Cancelled' : 'Scheduled'),
      el('td', { class: 'actions' }, el('button', {
        type: 'button', class: 'btn btn-sm btn-outline-secondary', 'aria-label': `${scheduleClass.cancelled ? 'Restore' : 'Cancel'} ${scheduleClass.title}`,
        onclick: () => {
          if (scheduleClass.cancelled || window.confirm(`Cancel "${scheduleClass.title}"? Students in this programme will see it as cancelled.`)) toggle(scheduleClass);
        },
      }, scheduleClass.cancelled ? 'Restore' : 'Cancel')))));
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
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await createClass(value);
      if (result.failed) {
        say(`Class added, but the announcement reached only ${result.sent} of ${result.recipientCount} students.`, 'error');
      } else if (result.recipientCount) {
        say(`Class added. A message with the details was sent to ${result.sent} ${result.sent === 1 ? 'student' : 'students'}.`, 'success');
      } else {
        say('Class added. No active students are enrolled in this programme yet.', 'success');
      }
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