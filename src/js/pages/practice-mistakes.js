import { guardPage } from '@/auth/guards.js';
import { ROUTES } from '@/core/routes.js';
import { questionIndex } from '@/practice/content.js';
import { dueMistakes } from '@/practice/engine.js';
import { SKILLS } from '@/practice/skills.js';
import { loadMistakes } from '@/services/practice-service.js';
import { h } from '@/ui/h.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('practice');
const session = await guardPage({ roles: ['student'] });

let mistakes = {};
try {
  mistakes = await loadMistakes(session.user.uid);
} catch (error) {
  console.warn('Could not load mistakes', error?.code ?? error);
  const note = document.getElementById('mistakesNote');
  note.hidden = false;
  note.textContent = 'Your mistakes could not be loaded. Check your connection and refresh the page.';
}

const index = questionIndex();
const now = new Date();
const open = Object.values(mistakes).filter((m) => m.status === 'open' && index[m.questionId]);
const due = dueMistakes(open, now);
const dueLabel = (m) => (!m.dueAt || new Date(m.dueAt) <= now ? 'Due now' : `Next review ${new Date(m.dueAt).toLocaleDateString('en-KE')}`);

document.getElementById('mistakesSummary').textContent = open.length
  ? `${open.length} to review · ${due.length} due now`
  : 'No mistakes to review. Questions you get wrong in lessons will appear here.';

document.getElementById('mistakesActions').replaceChildren(
  due.length ? h('a', { class: 'btn btn-primary', href: `${ROUTES.practiceLesson}?skill=review` }, `Practise ${Math.min(due.length, 10)} due now`) : '',
  open.length > due.length ? h('a', { class: 'btn', href: `${ROUTES.practiceLesson}?skill=review&all=1` }, 'Practise all open mistakes') : '',
);

document.getElementById('mistakesList').replaceChildren(...SKILLS.flatMap((skill) => {
  const items = open.filter((m) => index[m.questionId].skillId === skill.id);
  if (!items.length) return [];
  return [h('section', { class: 'card' },
    h('h2', {}, skill.label),
    h('ul', { class: 'review-list' }, ...items.map((m) => {
      const { question } = index[m.questionId];
      return h('li', {},
        h('strong', {}, question.prompt),
        h('div', {}, `Correct answer: ${question.options[question.answer]}`),
        h('div', { class: 'muted' }, question.why),
        h('div', { class: 'muted' }, `Missed ${m.count} ${m.count === 1 ? 'time' : 'times'} · ${dueLabel(m)}`));
    })))];
}));
