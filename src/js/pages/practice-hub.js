import { guardPage } from '@/auth/guards.js';
import { lessonUrl } from '@/practice/content.js';
import { dueMistakes, lessonStatus, pickContinue } from '@/practice/engine.js';
import { ROUTES } from '@/core/routes.js';
import { loadOverview } from '@/practice/overview.js';
import { loadMistakes } from '@/services/practice-service.js';
import { SKILLS } from '@/practice/skills.js';
import { h } from '@/ui/h.js';
import { mountPortalShell } from '@/ui/portal-shell.js';
import { skillCard } from '@/ui/skill-card.js';

mountPortalShell('practice');
const session = await guardPage({ roles: ['student'] });
const { entries, failed } = await loadOverview(session.user.uid);
let mistakeList = [];
try { mistakeList = Object.values(await loadMistakes(session.user.uid)).filter((m) => m.status === 'open'); } catch (error) { console.warn('Could not load mistakes', error?.code ?? error); }
const dueCount = dueMistakes(mistakeList).length;

const pick = pickContinue(entries);
document.getElementById('hubContinueTitle').textContent = pick ? pick.next.title : 'All available lessons complete';
document.getElementById('hubContinueText').textContent = pick
  ? `${pick.skill.label}: ${pick.done} of ${pick.lessons.length} lessons completed. ${pick.next.summary}`
  : 'You can review any lesson below. More skills are on the way.';
document.getElementById('hubContinueAction').replaceChildren(
  pick ? h('a', { class: 'btn btn-primary', href: lessonUrl(pick.skill.id, pick.next.id) }, pick.done ? 'Continue' : 'Start lesson') : '',
);

document.getElementById('skillGrid').replaceChildren(...SKILLS.map((skill) => skillCard(skill, entries.find((e) => e.skill.id === skill.id), { href: `#${skill.id}Lessons`, detail: true })));

if (failed) {
  const note = document.getElementById('hubNote');
  note.hidden = false;
  note.textContent = 'Some saved progress could not be loaded. You can still practise, and results are saved when the connection returns.';
}

document.getElementById('skillSections').replaceChildren(
  h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Review'), h('h2', {}, 'My mistakes'),
    h('p', { class: 'muted' }, mistakeList.length ? `${mistakeList.length} to review · ${dueCount} due now` : 'Nothing to review yet.'),
    h('a', { class: dueCount ? 'btn btn-primary' : 'btn', href: ROUTES.practiceMistakes }, dueCount ? 'Review mistakes' : 'View my mistakes')),
  ...entries.map((entry) => h('section', { class: 'card', id: `${entry.skill.id}Lessons`, 'aria-labelledby': `${entry.skill.id}Heading` },
  h('p', { class: 'eyebrow' }, entry.skill.label),
  h('h2', { id: `${entry.skill.id}Heading` }, `${entry.skill.label} lessons`),
  h('ol', { class: 'lesson-list' }, ...entry.lessons.map((lesson) => {
    const completed = lessonStatus(entry.progress, lesson.id) === 'completed';
    return h('li', { class: 'lesson-row' },
      h('div', {}, h('h3', {}, lesson.title), h('p', {}, completed ? (entry.progress[lesson.id].bestPercent == null ? 'Completed' : `Completed · best score ${entry.progress[lesson.id].bestPercent}%`) : lesson.summary)),
      h('a', { class: completed ? 'btn' : 'btn btn-primary', href: lessonUrl(entry.skill.id, lesson.id) }, completed ? 'Review' : 'Start'));
  })))));
