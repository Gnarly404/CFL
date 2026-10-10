/** Pure logic for daily goals, streaks, recommendations and badges. Nothing here touches the browser or Firebase. */

export const GOAL_OPTIONS = Object.freeze([10, 20, 30, 60]);
export const DEFAULT_GOAL = 20;
/** A tab left open must not count as hours of study, so one session is capped. */
export const MAX_SESSION_SECONDS = 20 * 60;
export const HISTORY_DAYS = 90;

const pad = (n) => String(n).padStart(2, '0');
/** Local calendar day as YYYY-MM-DD. */
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dayNumber = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const daysAgoKey = (days, now = new Date()) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));

export function sessionSeconds(startMs, endMs) {
  return Math.min(MAX_SESSION_SECONDS, Math.max(5, Math.round((endMs - startMs) / 1000)));
}

export function todaySummary(sessions, goalMinutes, now = new Date()) {
  const key = dayKey(now);
  const today = sessions.filter((s) => s.date === key);
  const bySkill = {};
  for (const s of today) bySkill[s.skill] = (bySkill[s.skill] ?? 0) + s.seconds;
  const seconds = today.reduce((sum, s) => sum + s.seconds, 0);
  const goalSeconds = goalMinutes * 60;
  return {
    seconds,
    minutes: Math.round(seconds / 60),
    goalMinutes,
    percent: Math.min(100, Math.round((seconds / goalSeconds) * 100)),
    reached: seconds >= goalSeconds,
    bySkill: Object.fromEntries(Object.entries(bySkill).map(([skill, s]) => [skill, Math.round(s / 60)])),
  };
}

/** Current streak counts today if there is practice today, otherwise yesterday, so an unfinished day does not reset it. */
export function streaks(sessions, now = new Date()) {
  const days = [...new Set(sessions.map((s) => s.date))].map(dayNumber).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  days.forEach((day, i) => {
    run = i > 0 && day === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  const set = new Set(days);
  const today = dayNumber(dayKey(now));
  let cursor = set.has(today) ? today : today - 1;
  let current = 0;
  while (set.has(cursor)) { current += 1; cursor -= 1; }
  return { current, longest };
}

/** Average of best scores over completed lessons that have a score (speaking and writing have none). */
export function skillAverage(entry) {
  const scores = entry.lessons
    .map((lesson) => entry.progress?.[lesson.id])
    .filter((record) => record?.status === 'completed' && typeof record.bestPercent === 'number')
    .map((record) => record.bestPercent);
  return scores.length ? { average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), count: scores.length } : null;
}

/**
 * Up to three explained suggestions. entries come from loadOverview; dueMistakes is a count.
 * Each has type, text (the reason) and where to go: skillId + lessonId, or review: true.
 */
export function recommendations({ entries, dueMistakes = 0, sessions = [] }) {
  const out = [];
  if (dueMistakes > 0) {
    out.push({ type: 'review', review: true, title: `Review ${Math.min(dueMistakes, 10)} mistakes`, minutes: 5, why: `${dueMistakes} ${dueMistakes === 1 ? 'question is' : 'questions are'} due for review today.` });
  }

  const scored = entries.map((entry) => ({ entry, stats: skillAverage(entry) })).filter((item) => item.stats);
  if (scored.length >= 2) {
    const all = scored.flatMap(({ entry }) => entry.lessons
      .map((lesson) => entry.progress?.[lesson.id])
      .filter((r) => r?.status === 'completed' && typeof r.bestPercent === 'number').map((r) => r.bestPercent));
    const overall = Math.round(all.reduce((a, b) => a + b, 0) / all.length);
    const weakest = scored.filter((item) => item.entry.next && item.stats.average <= overall - 10)
      .sort((a, b) => a.stats.average - b.stats.average)[0];
    if (weakest) {
      out.push({
        type: 'low-score', skillId: weakest.entry.skill.id, lessonId: weakest.entry.next.id, minutes: 10,
        title: `Practise ${weakest.entry.skill.label}: ${weakest.entry.next.title}`,
        why: `${weakest.entry.skill.label} is below your overall average (${weakest.stats.average}% compared with ${overall}%).`,
      });
    }
  }

  const last = [...sessions].filter((s) => s.skill !== 'review').sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
  const resume = last && entries.find((entry) => entry.skill.id === last.skill && entry.next);
  if (resume) {
    out.push({ type: 'resume', skillId: resume.skill.id, lessonId: resume.next.id, minutes: 10, title: `Continue ${resume.skill.label}: ${resume.next.title}`, why: `You last practised ${resume.skill.label}. Pick up from the next lesson.` });
  }

  if (!out.length) {
    const first = entries.find((entry) => entry.next);
    if (first) out.push({ type: 'start', skillId: first.skill.id, lessonId: first.next.id, minutes: 10, title: `Start ${first.skill.label}: ${first.next.title}`, why: sessions.length ? 'This is the next lesson waiting for you.' : 'Begin with your first lesson.' });
  }

  const seen = new Set();
  return out.filter((item) => { const key = item.review ? 'review' : `${item.skillId}/${item.lessonId}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
}

/** Subtle badges, worked out from real activity each time (nothing is stored, so none can be faked). */
export function badges({ sessions, entries, now = new Date() }) {
  const list = [];
  if (sessions.length) list.push({ id: 'first-lesson', label: 'First lesson', detail: 'You finished a practice session.' });
  const { longest } = streaks(sessions, now);
  if (longest >= 7) list.push({ id: 'streak-7', label: '7 day streak', detail: `Your best run in the last ${HISTORY_DAYS} days is ${longest} days.` });
  for (const entry of entries) {
    if (entry.lessons.length && entry.done === entry.lessons.length) list.push({ id: `skill-${entry.skill.id}`, label: `${entry.skill.label} complete`, detail: `All ${entry.lessons.length} ${entry.skill.label} lessons are finished.` });
  }
  return list;
}
