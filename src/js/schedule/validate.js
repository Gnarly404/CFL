import { MODES, safeJoinLink } from './state.js';

export const MAX_TITLE = 120;
export const MAX_NOTES = 500;
export const MAX_LOCATION = 200;

/**
 * Turns the admin's form values into a class document. Dates and times are read in the browser's own time zone.
 * Returns { errors, value }; value is only meaningful when errors is empty.
 */
export function buildClass(form, instructors = []) {
  const errors = [];
  const programmeId = String(form.programmeId ?? '').trim();
  const title = String(form.title ?? '').trim();
  const mode = form.mode in MODES ? form.mode : null;
  const location = String(form.location ?? '').trim();
  const notes = String(form.notes ?? '').trim();
  const rawLink = String(form.joinLink ?? '').trim();
  const start = new Date(`${form.date}T${form.start}`);
  const end = new Date(`${form.date}T${form.end}`);

  if (!programmeId) errors.push('Choose a programme.');
  if (!title) errors.push('Give the class a title.');
  else if (title.length > MAX_TITLE) errors.push(`Keep the title under ${MAX_TITLE} characters.`);
  if (!mode) errors.push('Choose in person or online.');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) errors.push('Choose a date, a start time and an end time.');
  else if (end <= start) errors.push('The end time must be after the start time.');
  if (location.length > MAX_LOCATION) errors.push(`Keep the location under ${MAX_LOCATION} characters.`);
  if (notes.length > MAX_NOTES) errors.push(`Keep the notes under ${MAX_NOTES} characters.`);
  if (rawLink && !safeJoinLink(rawLink)) errors.push('The join link must start with https://.');

  const instructor = instructors.find((i) => i.uid === form.instructorId) ?? null;
  return {
    errors,
    value: {
      programmeId, title, mode, location, notes,
      joinLink: rawLink ? safeJoinLink(rawLink) : '',
      instructorId: instructor?.uid ?? '',
      instructorName: instructor ? (instructor.displayName || instructor.email || '') : '',
      startsAt: start, endsAt: end,
    },
  };
}
