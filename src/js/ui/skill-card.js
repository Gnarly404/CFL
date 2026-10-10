import { h } from './h.js';
import { icon, iconNames } from './icons.js';

/** Where a skill stands, from real lesson progress: soon, new, started or done. */
export function skillState(entry) {
  if (!entry) return 'soon';
  if (entry.lessons.length && entry.done >= entry.lessons.length) return 'done';
  return entry.done > 0 ? 'started' : 'new';
}

const CTA = { new: 'Start', started: 'Continue', done: 'Review' };

const bar = (percent, label) => h('div', {
  class: 'progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent, style: `--value:${percent}%`,
}, h('span'));

/**
 * Practice skill card (spec 8.2): icon, name, one-line outcome, progress, state and a clear action.
 * `detail` adds the lesson count (the hub shows it; the dashboard keeps the card lighter).
 */
export function skillCard(skill, entry, { href, detail = false } = {}) {
  const state = skillState(entry);
  const art = h('span', { class: 'skill-icon' }, iconNames.includes(skill.id) ? icon(skill.id) : '');
  const head = h('span', { class: 'skill-body' }, h('strong', { class: 'skill-name' }, skill.label), h('span', { class: 'skill-blurb' }, skill.blurb ?? ''));
  if (state === 'soon') {
    return h('div', { class: 'skill', 'aria-disabled': 'true', 'data-state': 'soon' }, art, head, h('small', {}, 'Coming soon'));
  }
  const summary = detail ? `${entry.percent}% complete · ${entry.done} of ${entry.lessons.length} lessons` : `${entry.percent}% complete`;
  return h('a', { class: 'skill', href, 'data-state': state },
    art, head, h('small', {}, summary), bar(entry.percent, `${skill.label} progress`),
    h('span', { class: 'skill-cta' }, CTA[state], icon('arrow', { size: 16 })));
}
