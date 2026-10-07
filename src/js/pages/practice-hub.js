import grammar from '../../data/practice/grammar.json';
import { guardPage } from '@/auth/guards.js';
import { ROUTES } from '@/core/routes.js';
import { lessonStatus, nextLesson, skillPercent } from '@/practice/engine.js';
import { SKILLS } from '@/practice/skills.js';
import { loadLessonProgress } from '@/services/practice-service.js';
import { h } from '@/ui/h.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('practice');
const session = await guardPage({ roles: ['student'] });

const lessons = grammar.lessons;
const lessonHref = (lesson) => `${ROUTES.practiceLesson}?skill=grammar&id=${encodeURIComponent(lesson.id)}`;
const bar = (percent, label) => h('div', {
  class: 'progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent, style: `--value:${percent}%`,
}, h('span'));

let progress = {};
let loadFailed = false;
try {
  progress = await loadLessonProgress(session.user.uid, 'grammar');
} catch (error) {
  loadFailed = true;
  console.warn('Could not load practice progress', error?.code ?? error);
}

const percent = skillPercent(lessons, progress);
const done = lessons.filter((lesson) => lessonStatus(progress, lesson.id) === 'completed').length;
const next = nextLesson(lessons, progress);

document.getElementById('hubContinueTitle').textContent = next ? next.title : 'Grammar complete';
document.getElementById('hubContinueText').textContent = next
  ? `${done === 0 ? 'Start here' : 'Next up'}: ${next.summary}`
  : 'You have finished every grammar lesson. You can review any lesson below.';
document.getElementById('hubContinueAction').replaceChildren(
  next ? h('a', { class: 'btn btn-primary', href: lessonHref(next) }, done === 0 ? 'Start lesson' : 'Continue') : '',
);

document.getElementById('skillGrid').replaceChildren(...SKILLS.map((skill) => (skill.available
  ? h('a', { class: 'skill', href: '#grammarTitle' }, skill.label, h('small', {}, `${percent}% complete · ${done} of ${lessons.length} lessons`), bar(percent, `${skill.label} progress`))
  : h('div', { class: 'skill', 'aria-disabled': 'true' }, skill.label, h('small', {}, 'Coming soon')))));

const note = document.getElementById('hubNote');
if (loadFailed) {
  note.hidden = false;
  note.textContent = 'Your saved progress could not be loaded. You can still practise, and results will be saved when the connection returns.';
}

document.getElementById('lessonList').replaceChildren(...lessons.map((lesson) => {
  const record = progress[lesson.id];
  const completed = lessonStatus(progress, lesson.id) === 'completed';
  return h('li', { class: 'lesson-row' },
    h('div', {}, h('h3', {}, lesson.title), h('p', {}, completed ? `Completed · best score ${record.bestPercent}%` : lesson.summary)),
    h('a', { class: completed ? 'btn' : 'btn btn-primary', href: lessonHref(lesson) }, completed ? 'Review' : 'Start'));
}));
