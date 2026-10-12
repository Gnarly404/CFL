import { guardPage } from '@/auth/guards.js';
import { lessonUrl, loadPracticeContent } from '@/practice/content.js';
import { loadOverview } from '@/practice/overview.js';
import { deckCounts } from '@/practice/flashcards.js';
import { loadWordProgress } from '@/services/practice-service.js';
import { h } from '@/ui/h.js';
import { mountNotificationBadge } from '@/ui/notification-badge.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('progress');
const session = await guardPage({ roles: ['student'] });
mountNotificationBadge(session.user.uid);

const $ = (id) => document.getElementById(id);
const skillFilter = $('skillFilter');
const statusFilter = $('statusFilter');
const notice = $('progressNotice');
const refreshButton = $('refreshProgress');
let entries = [];
let vocabulary = { mastered: 0, total: 0 };

const recordTime = (record) => {
  const date = record?.updatedAt?.toDate?.() ?? (record?.updatedAt ? new Date(record.updatedAt) : null);
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

function savedDate(record) {
  const time = recordTime(record);
  return time ? new Date(time).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Saved lesson';
}

function drawSkills() {
  const lessons = entries.flatMap((entry) => entry.lessons.map((lesson) => ({ entry, lesson })));
  const completed = lessons.filter(({ entry, lesson }) => entry.progress[lesson.id]?.status === 'completed').length;
  const scores = lessons.map(({ entry, lesson }) => entry.progress[lesson.id]?.bestPercent)
    .filter((score) => typeof score === 'number');
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;

  $('completedCount').textContent = String(completed);
  $('lessonTotal').textContent = `of ${lessons.length} available lessons`;
  $('averageScore').textContent = average == null ? '—' : `${average}%`;
  $('scoreCount').textContent = average == null ? 'Complete scored lessons to see an average' : `From ${scores.length} scored ${scores.length === 1 ? 'lesson' : 'lessons'}`;
  $('masteredWords').textContent = String(vocabulary.mastered);
  $('wordTotal').textContent = `of ${vocabulary.total} vocabulary cards`;

  skillFilter.replaceChildren(h('option', { value: 'all' }, 'All skills'), ...entries.map(({ skill }) => h('option', { value: skill.id }, skill.label)));
  $('skillProgress').replaceChildren(...entries.map(({ skill, lessons: skillLessons, percent, done }) => {
    const count = skillLessons.length;
    return h('article', { class: 'progress-skill-row' },
      h('div', { class: 'progress-skill-copy' },
        h('div', { class: 'progress-skill-title' }, h('h3', {}, skill.label), h('span', {}, `${done} / ${count}`)),
        h('p', { class: 'muted' }, count ? (done === count ? 'All lessons completed' : `${count - done} ${count - done === 1 ? 'lesson' : 'lessons'} to go`) : 'No lessons available yet.')),
      h('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': `${skill.label} completion`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent },
        h('span', { style: `--value:${percent}%` })));
  }));
  drawLessons();
}

function drawLessons() {
  const selectedSkill = skillFilter.value;
  const selectedStatus = statusFilter.value;
  const rows = entries.flatMap((entry) => entry.lessons.map((lesson) => ({ entry, lesson, record: entry.progress[lesson.id] })))
    .filter(({ entry }) => selectedSkill === 'all' || entry.skill.id === selectedSkill)
    .filter(({ record }) => selectedStatus === 'all' || (selectedStatus === 'completed' ? record?.status === 'completed' : record?.status !== 'completed'))
    .sort((a, b) => recordTime(b.record) - recordTime(a.record) || a.lesson.title.localeCompare(b.lesson.title));

  $('filteredCount').textContent = `${rows.length} ${rows.length === 1 ? 'lesson' : 'lessons'}`;
  $('lessonProgress').replaceChildren(...(rows.length ? rows.map(({ entry, lesson, record }) => {
    const completed = record?.status === 'completed';
    const score = typeof record?.bestPercent === 'number' ? `Best ${record.bestPercent}%` : (completed ? 'Completed' : 'Not started');
    const lastScore = typeof record?.lastPercent === 'number' && record.lastPercent !== record.bestPercent ? ` · latest ${record.lastPercent}%` : '';
    const attempts = record?.attempts ? ` · ${record.attempts} ${record.attempts === 1 ? 'attempt' : 'attempts'}` : '';
    return h('article', { class: `progress-lesson-row${completed ? ' is-complete' : ''}` },
      h('div', { class: 'progress-lesson-copy' },
        h('div', { class: 'progress-lesson-heading' }, h('span', { class: 'progress-lesson-skill' }, entry.skill.label), h('span', { class: `progress-lesson-state${completed ? ' is-complete' : ''}` }, completed ? 'Completed' : 'Not started')),
        h('h3', {}, lesson.title),
        h('p', { class: 'muted' }, completed ? `${score}${lastScore}${attempts} · ${savedDate(record)}` : lesson.summary)),
      h('a', { class: completed ? 'student-dashboard-action' : 'student-dashboard-action student-dashboard-action--primary', href: lessonUrl(entry.skill.id, lesson.id) }, completed ? 'Review lesson' : 'Start lesson'));
  }) : [h('p', { class: 'progress-empty muted' }, 'No lessons match these filters.') ]));
}

async function refresh() {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Refreshing…';
  notice.hidden = true;
  let hasFailure;
  try {
    await loadPracticeContent();
    const overview = await loadOverview(session.user.uid);
    entries = overview.entries;
    hasFailure = overview.failed;
  } catch (error) {
    hasFailure = true;
    console.warn('Could not load student progress', error?.code ?? error);
  }
  try {
    vocabulary = deckCounts(await loadWordProgress(session.user.uid));
  } catch (error) {
    hasFailure = true;
    console.warn('Could not load vocabulary progress', error?.code ?? error);
    vocabulary = { mastered: 0, total: 0 };
  }
  drawSkills();
  notice.hidden = !hasFailure;
  notice.textContent = hasFailure
    ? 'Some saved progress could not be retrieved. Check your connection and refresh to try again.'
    : 'Progress updated from your saved practice results.';
  refreshButton.disabled = false;
  refreshButton.textContent = 'Refresh progress';
}

skillFilter.addEventListener('change', drawLessons);
statusFilter.addEventListener('change', drawLessons);
refreshButton.addEventListener('click', refresh);
await refresh();