import { describe, expect, it } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import vocabulary from '../../src/data/practice/vocabulary.json';
import { lessonStatus, nextLesson, pickContinue, scoreAttempt, skillPercent, validateLesson } from '@/practice/engine.js';

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
