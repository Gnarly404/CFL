import { describe, expect, it } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import vocabulary from '../../src/data/practice/vocabulary.json';
import { dueMistakes, lessonStatus, nextLesson, pickContinue, scoreAttempt, skillPercent, updateMistake, validateLesson } from '@/practice/engine.js';

const lessons = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const questions = [{ id: 'q1', answer: 1 }, { id: 'q2', answer: 0 }, { id: 'q3', answer: 2 }, { id: 'q4', answer: 1 }];

describe('scoreAttempt', () => {
  it('counts correct answers and lists mistakes', () => {
    expect(scoreAttempt(questions, [1, 1, 2, 0])).toEqual({ correct: 2, total: 4, percent: 50, mistakes: ['q2', 'q4'] });
  });
  it('treats unanswered questions as mistakes', () => {
    expect(scoreAttempt(questions, []).correct).toBe(0);
  });
  it('handles an empty list', () => {
    expect(scoreAttempt([], [])).toEqual({ correct: 0, total: 0, percent: 0, mistakes: [] });
  });
});

describe('progress helpers', () => {
  const progress = { a: { status: 'completed' }, b: { status: 'started' } };
  it('computes status, percent and next lesson', () => {
    expect(lessonStatus(progress, 'a')).toBe('completed');
    expect(lessonStatus(progress, 'b')).toBe('new');
    expect(skillPercent(lessons, progress)).toBe(33);
    expect(nextLesson(lessons, progress).id).toBe('b');
  });
  it('returns null when everything is complete', () => {
    const all = { a: { status: 'completed' }, b: { status: 'completed' }, c: { status: 'completed' } };
    expect(nextLesson(lessons, all)).toBeNull();
    expect(skillPercent(lessons, all)).toBe(100);
  });
  it('is safe with no progress', () => {
    expect(skillPercent(lessons, {})).toBe(0);
    expect(skillPercent([], {})).toBe(0);
  });
});

describe('spaced mistake review', () => {
  const now = new Date('2026-10-10T08:00:00.000Z');
  const days = (n) => new Date(now.getTime() + n * 86400000).toISOString();
  it('opens a mistake due in a day on a wrong answer, and counts repeats', () => {
    expect(updateMistake(null, false, now)).toMatchObject({ box: 0, count: 1, status: 'open', dueAt: days(1) });
    expect(updateMistake({ box: 2, count: 2, status: 'open', dueAt: days(5) }, false, now)).toMatchObject({ box: 0, count: 3, dueAt: days(1) });
  });
  it('ignores a correct answer with no open mistake', () => {
    expect(updateMistake(null, true, now)).toBeNull();
    expect(updateMistake({ box: 3, status: 'resolved' }, true, now)).toBeNull();
  });
  it('does not advance a mistake that is not due yet', () => {
    expect(updateMistake({ box: 0, count: 1, status: 'open', dueAt: days(1) }, true, now)).toBeNull();
  });
  it('moves a due mistake through 3 and 7 days, then resolves it', () => {
    const due = { box: 0, count: 1, status: 'open', dueAt: days(-1) };
    const one = updateMistake(due, true, now);
    expect(one).toMatchObject({ box: 1, status: 'open', dueAt: days(3) });
    const two = updateMistake({ ...one, dueAt: days(-1) }, true, now);
    expect(two).toMatchObject({ box: 2, status: 'open', dueAt: days(7) });
    expect(updateMistake({ ...two, dueAt: days(-1) }, true, now)).toMatchObject({ box: 3, status: 'resolved', dueAt: null });
  });
  it('lists only open, due mistakes, oldest first', () => {
    const list = [
      { questionId: 'a', status: 'open', dueAt: days(-1) },
      { questionId: 'b', status: 'open', dueAt: days(2) },
      { questionId: 'c', status: 'resolved', dueAt: null },
      { questionId: 'd', status: 'open', dueAt: days(-3) },
    ];
    expect(dueMistakes(list, now).map((m) => m.questionId)).toEqual(['d', 'a']);
  });
});

describe('pickContinue', () => {
  const entry = (id, done, next) => ({ skill: { id }, done, next });
  it('prefers a skill already started, then the first with a lesson left', () => {
    expect(pickContinue([entry('a', 0, {}), entry('b', 2, {})]).skill.id).toBe('b');
    expect(pickContinue([entry('a', 0, {}), entry('b', 0, {})]).skill.id).toBe('a');
  });
  it('skips finished skills and returns null when all are finished', () => {
    expect(pickContinue([entry('a', 5, null), entry('b', 0, {})]).skill.id).toBe('b');
    expect(pickContinue([entry('a', 5, null)])).toBeNull();
    expect(pickContinue([])).toBeNull();
  });
});

describe.each([['grammar', grammar], ['vocabulary', vocabulary]])('%s content', (_name, content) => {
  it('has valid lessons with unique ids', () => {
    const problems = content.lessons.flatMap(validateLesson);
    expect(problems).toEqual([]);
    const ids = content.lessons.flatMap((l) => [l.id, ...l.questions.map((q) => q.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('flags a broken question', () => {
    const bad = { id: 'x', title: 'X', rule: ['r'], examples: [{ text: 't', note: 'n' }], questions: [{ id: 'q', options: ['a', 'b'], answer: 5, why: '' }] };
    expect(validateLesson(bad).length).toBeGreaterThanOrEqual(2);
  });
});
