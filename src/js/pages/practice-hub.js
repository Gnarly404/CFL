import { guardPage } from '@/auth/guards.js';
import { lessonUrl } from '@/practice/content.js';
import { lessonStatus, pickContinue } from '@/practice/engine.js';
import { loadOverview } from '@/practice/overview.js';
import { SKILLS } from '@/practice/skills.js';
import { h } from '@/ui/h.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('practice');
const session = await guardPage({ roles: ['student'] });
const { entries, failed } = await loadOverview(session.user.uid);

const bar = (percent, label) => h('div', {
  class: 'progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent, style: `--value:${percent}%`,
}, h('span'));

const pick = pickContinue(entries);
document.getElementById('hubContinueTitle').textContent = pick ? pick.next.title : 'All available lessons complete';
document.getElementById('hubContinueText').textContent = pick
  ? `${pick.skill.label}: ${pick.done} of ${pick.lessons.length} lessons completed. ${pick.next.summary}`
  : 'You can review any lesson below. More skills are on the way.';
document.getElementById('hubContinueAction').replaceChildren(
  pick ? h('a', { class: 'btn btn-primary', href: lessonUrl(pick.skill.id, pick.next.id) }, pick.done ? 'Continue' : 'Start lesson') : '',
);

document.getElementById('skillGrid').replaceChildren(...SKILLS.map((skill) => {
  const entry = entries.find((e) => e.skill.id === skill.id);
  return entry
    ? h('a', { class: 'skill', href: `#${skill.id}Lessons` }, skill.label,
      h('small', {}, `${entry.percent}% complete · ${entry.done} of ${entry.lessons.length} lessons`), bar(entry.percent, `${skill.label} progress`))
    : h('div', { class: 'skill', 'aria-disabled': 'true' }, skill.label, h('small', {}, 'Coming soon'));
}));

if (failed) {
  const note = document.getElementById('hubNote');
  note.hidden = false;
  note.textContent = 'Some saved progress could not be loaded. You can still practise, and results are saved when the connection returns.';
}

document.getElementById('skillSections').replaceChildren(...entries.map((entry) => h('section', { class: 'card', id: `${entry.skill.id}Lessons`, 'aria-labelledby': `${entry.skill.id}Heading` },
  h('p', { class: 'eyebrow' }, entry.skill.label),
  h('h2', { id: `${entry.skill.id}Heading` }, `${entry.skill.label} lessons`),
  h('ol', { class: 'lesson-list' }, ...entry.lessons.map((lesson) => {
    const completed = lessonStatus(entry.progress, lesson.id) === 'completed';
    return h('li', { class: 'lesson-row' },
      h('div', {}, h('h3', {}, lesson.title), h('p', {}, completed ? `Completed · best score ${entry.progress[lesson.id].bestPercent}%` : lesson.summary)),
      h('a', { class: completed ? 'btn' : 'btn btn-primary', href: lessonUrl(entry.skill.id, lesson.id) }, completed ? 'Review' : 'Start'));
  })))));
