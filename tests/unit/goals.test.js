import { describe, expect, it } from 'vitest';
import { MAX_SESSION_SECONDS, badges, dayKey, recommendations, sessionSeconds, skillAverage, streaks, todaySummary } from '@/practice/goals.js';

const now = new Date(2026, 9, 10, 15, 0, 0); // 10 Oct 2026, local
const day = (offset) => dayKey(new Date(2026, 9, 10 + offset));
const session = (offset, skill = 'grammar', seconds = 300, extra = {}) => ({ date: day(offset), skill, seconds, createdAtMs: new Date(2026, 9, 10 + offset, 10).getTime(), ...extra });
const skill = (id, label) => ({ id, label });
const lessons = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, title: `${prefix} ${i + 1}` }));
const entry = (id, label, scores, total = scores.length + 1) => {
  const ls = lessons(total, id);
  const progress = Object.fromEntries(scores.map((s, i) => [ls[i].id, { status: 'completed', bestPercent: s }]));
  return { skill: skill(id, label), lessons: ls, progress, done: scores.length, next: ls[scores.length] ?? null };
};

describe('time', () => {
  it('formats local days and caps one session', () => {
    expect(dayKey(now)).toBe('2026-10-10');
    expect(sessionSeconds(0, 90_000)).toBe(90);
    expect(sessionSeconds(0, 3 * 3600 * 1000)).toBe(MAX_SESSION_SECONDS);
    expect(sessionSeconds(0, 100)).toBe(5);
  });
});

describe('todaySummary', () => {
  it('adds up only today and breaks it down by skill', () => {
    const s = todaySummary([session(0, 'grammar', 600), session(0, 'reading', 300), session(-1, 'grammar', 900)], 20, now);
    expect(s).toMatchObject({ minutes: 15, percent: 75, reached: false, bySkill: { grammar: 10, reading: 5 } });
  });
  it('caps the bar at 100 and reports the goal reached', () => {
    const s = todaySummary([session(0, 'grammar', 1500)], 10, now);
    expect(s).toMatchObject({ percent: 100, reached: true });
  });
  it('handles no practice', () => {
    expect(todaySummary([], 20, now)).toMatchObject({ minutes: 0, percent: 0, reached: false, bySkill: {} });
  });
});

describe('streaks', () => {
  it('counts back from today', () => {
    expect(streaks([session(0), session(-1), session(-2), session(-4)], now)).toEqual({ current: 3, longest: 3 });
  });
  it('keeps the streak alive until the end of today when only yesterday has practice', () => {
    expect(streaks([session(-1), session(-2)], now).current).toBe(2);
  });
  it('resets after a missed day but remembers the longest run', () => {
    expect(streaks([session(-2), session(-3), session(-4), session(-5)], now)).toEqual({ current: 0, longest: 4 });
  });
  it('counts a day once however many sessions', () => {
    expect(streaks([session(0), session(0), session(0)], now)).toEqual({ current: 1, longest: 1 });
  });
  it('is zero with no sessions', () => {
    expect(streaks([], now)).toEqual({ current: 0, longest: 0 });
  });
});

describe('skillAverage', () => {
  it('ignores lessons without a score', () => {
    const e = entry('speaking', 'Speaking', [90, null]);
    e.progress.speaking2 = { status: 'completed', bestPercent: null };
    expect(skillAverage(e)).toEqual({ average: 90, count: 1 });
  });
  it('is null when nothing is scored', () => {
    expect(skillAverage(entry('reading', 'Reading', []))).toBeNull();
  });
});

describe('recommendations', () => {
  const entries = [entry('grammar', 'Grammar', [90, 90]), entry('listening', 'Listening', [50, 60])];

  it('explains a skill that is below the overall average', () => {
    const recs = recommendations({ entries, sessions: [] });
    expect(recs[0]).toMatchObject({ type: 'low-score', skillId: 'listening', lessonId: 'listening3' });
    expect(recs[0].why).toBe('Listening is below your overall average (55% compared with 73%).');
  });
  it('puts due mistakes first with a count', () => {
    const recs = recommendations({ entries, dueMistakes: 1, sessions: [] });
    expect(recs[0]).toMatchObject({ type: 'review', review: true });
    expect(recs[0].why).toBe('1 question is due for review today.');
  });
  it('does not call a small gap weak', () => {
    const close = [entry('grammar', 'Grammar', [80]), entry('listening', 'Listening', [75])];
    expect(recommendations({ entries: close, sessions: [] }).find((r) => r.type === 'low-score')).toBeUndefined();
  });
  it('resumes the skill practised last, without repeating a lesson already suggested', () => {
    const recs = recommendations({ entries, sessions: [session(0, 'listening')] });
    expect(recs.map((r) => r.type)).toEqual(['low-score']);
    const other = recommendations({ entries, sessions: [session(0, 'grammar')] });
    expect(other.map((r) => r.type)).toEqual(['low-score', 'resume']);
    expect(other[1].lessonId).toBe('grammar3');
  });
  it('ignores mistake-review sessions when choosing what to resume', () => {
    const recs = recommendations({ entries: [entry('grammar', 'Grammar', [90])], sessions: [session(0, 'review')] });
    expect(recs.map((r) => r.type)).toEqual(['start']);
  });
  it('suggests the first lesson for a new student, and nothing when all is finished', () => {
    const fresh = recommendations({ entries: [entry('grammar', 'Grammar', [])], sessions: [] });
    expect(fresh[0]).toMatchObject({ type: 'start', skillId: 'grammar', lessonId: 'grammar1' });
    expect(fresh[0].why).toBe('Begin with your first lesson.');
    const done = [{ skill: skill('g', 'G'), lessons: lessons(1, 'g'), progress: {}, done: 1, next: null }];
    expect(recommendations({ entries: done, sessions: [] })).toEqual([]);
  });
  it('never returns more than three', () => {
    expect(recommendations({ entries, dueMistakes: 3, sessions: [session(0, 'grammar')] }).length).toBeLessThanOrEqual(3);
  });
});

describe('badges', () => {
  it('awards only what the activity shows', () => {
    expect(badges({ sessions: [], entries: [], now })).toEqual([]);
    const week = Array.from({ length: 7 }, (_, i) => session(-i));
    const done = [{ skill: skill('grammar', 'Grammar'), lessons: lessons(2, 'g'), progress: {}, done: 2, next: null }];
    expect(badges({ sessions: week, entries: done, now }).map((b) => b.id)).toEqual(['first-lesson', 'streak-7', 'skill-grammar']);
    expect(badges({ sessions: [session(0)], entries: [entry('x', 'X', [1])], now }).map((b) => b.id)).toEqual(['first-lesson']);
  });
});
