import { ROUTES } from '@/core/routes.js';
import { loadMistakes, loadSessions } from '@/services/practice-service.js';
import { h } from '@/ui/h.js';
import { lessonUrl } from './content.js';
import { DEFAULT_GOAL, GOAL_OPTIONS, HISTORY_DAYS, badges, daysAgoKey, recommendations, streaks, todaySummary } from './goals.js';
import { dueMistakes } from './engine.js';
import { SKILLS } from './skills.js';

const goalKey = (uid) => `cfl.goalMinutes.${uid}`;
export function readGoal(uid) {
  try {
    const value = Number(window.localStorage.getItem(goalKey(uid)));
    return GOAL_OPTIONS.includes(value) ? value : DEFAULT_GOAL;
  } catch { return DEFAULT_GOAL; }
}
function saveGoal(uid, value) {
  try { window.localStorage.setItem(goalKey(uid), String(value)); } catch { /* the goal still works for this visit */ }
}

const label = (skillId) => (skillId === 'review' ? 'Mistake review' : SKILLS.find((s) => s.id === skillId)?.label ?? skillId);
const hrefFor = (rec) => (rec.review ? `${ROUTES.practiceLesson}?skill=review` : lessonUrl(rec.skillId, rec.lessonId));

function draw(container, state) {
  const { uid, sessions, entries, dueCount, failed } = state;
  const goal = readGoal(uid);
  const summary = todaySummary(sessions, goal);
  const recs = recommendations({ entries, dueMistakes: dueCount, sessions });
  const streak = streaks(sessions);
  const earned = badges({ sessions, entries });

  const picker = h('fieldset', { class: 'goal-picker' }, h('legend', {}, 'Daily goal'),
    ...GOAL_OPTIONS.map((minutes) => {
      const input = h('input', { type: 'radio', name: 'goal', id: `goal-${minutes}`, value: minutes });
      input.checked = minutes === goal;
      input.addEventListener('change', () => { saveGoal(uid, minutes); draw(container, state); });
      return h('label', { for: `goal-${minutes}`, class: 'goal-opt' }, input, h('span', {}, `${minutes} min`));
    }));

  const breakdown = Object.entries(summary.bySkill);
  const top = recs[0];
  container.replaceChildren(
    h('p', { class: 'eyebrow' }, "Today's practice"),
    h('h2', {}, `${summary.minutes} of ${summary.goalMinutes} minutes`),
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Daily goal progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': summary.percent, style: `--value:${summary.percent}%` }, h('span')),
    failed ? h('p', { class: 'form-note', role: 'alert' }, "Today's practice could not be loaded, so these numbers may be too low.") : '',
    breakdown.length
      ? h('ul', { class: 'today-list' }, ...breakdown.map(([skill, minutes]) => h('li', {}, `${label(skill)} · ${minutes} min`)))
      : h('p', { class: 'muted' }, 'No practice yet today.'),
    h('p', { class: 'muted' }, 'Time is counted when you finish a lesson, up to 20 minutes per lesson.'),
    picker,
    summary.reached ? h('p', {}, 'Goal reached. Well done.') : '',
    top ? h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: hrefFor(top) }, summary.reached ? 'Keep practising' : 'Start goal')) : '',
    streak.current > 0 || streak.longest > 0
      ? h('p', { class: 'muted' }, `Streak: ${streak.current} ${streak.current === 1 ? 'day' : 'days'} · best ${streak.longest} (last ${HISTORY_DAYS} days)`)
      : '',
    recs.length ? h('div', {}, h('h3', {}, 'Recommended for you'),
      h('ul', { class: 'review-list' }, ...recs.map((rec) => h('li', {}, h('strong', {}, rec.title), h('div', { class: 'muted' }, rec.why), h('a', { class: 'link-btn', href: hrefFor(rec) }, `Start (about ${rec.minutes} min)`))))) : '',
    earned.length ? h('div', {}, h('h3', {}, 'Achievements'), h('ul', { class: 'badge-list' }, ...earned.map((b) => h('li', { class: 'badge', title: b.detail }, b.label)))) : '',
  );
}

/** Loads real sessions and mistakes, then draws the goal, recommendations, streak and badges into `container`. */
export async function mountToday(container, { uid, entries, mistakes }) {
  let failed = false;
  let sessions = [];
  try {
    sessions = await loadSessions(uid, daysAgoKey(HISTORY_DAYS));
  } catch (error) {
    failed = true;
    console.warn('Could not load practice sessions', error?.code ?? error);
  }
  let due = mistakes;
  if (!due) {
    try { due = Object.values(await loadMistakes(uid)); } catch (error) { console.warn('Could not load mistakes', error?.code ?? error); due = []; }
  }
  draw(container, { uid, sessions, entries, dueCount: dueMistakes(due.filter((m) => m.status === 'open')).length, failed });
}
