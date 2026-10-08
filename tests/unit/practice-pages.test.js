// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import { loadPage, tick } from '../helpers.js';

const loadMistakes = vi.fn();
const loadLessonProgress = vi.fn();
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'u1' } }) }));
vi.mock('@/services/practice-service.js', () => ({
  loadLessonProgress: (...args) => loadLessonProgress(...args),
  loadMistakes: (...args) => loadMistakes(...args),
}));

const text = (id) => document.getElementById(id).textContent;

async function open(path, script) {
  vi.resetModules();
  loadPage(path);
  await import(script);
  await tick();
}

describe('practice hub page', () => {
  beforeEach(() => {
    loadMistakes.mockReset().mockResolvedValue({});
    loadLessonProgress.mockReset().mockResolvedValue({});
  });

  it('offers the first lesson, lists skills and shows live and coming-soon skills', async () => {
    await open('student/practice/index.html', '@/pages/practice-hub.js');
    expect(text('hubContinueTitle')).toBe(grammar.lessons[0].title);
    expect(document.querySelectorAll('#skillGrid .skill')).toHaveLength(6);
    expect(document.querySelectorAll('#skillGrid [aria-disabled="true"]')).toHaveLength(4);
    expect(text('skillSections')).toContain('Vocabulary lessons');
    expect(text('skillSections')).toContain('Nothing to review yet.');
  });

  it('continues the skill already started and shows mistakes due', async () => {
    loadLessonProgress.mockImplementation(async (_uid, skill) => (skill === 'vocabulary' ? { 'vocab-family': { status: 'completed', bestPercent: 80 } } : {}));
    loadMistakes.mockResolvedValue({ x: { questionId: 'be-1', status: 'open', dueAt: '2000-01-01T00:00:00.000Z' } });
    await open('student/practice/index.html', '@/pages/practice-hub.js');
    expect(text('hubContinueText')).toContain('Vocabulary: 1 of 4');
    expect(text('skillSections')).toContain('1 to review · 1 due now');
  });

  it('warns when progress cannot be loaded but still renders', async () => {
    loadLessonProgress.mockRejectedValue(Object.assign(new Error('x'), { code: 'unavailable' }));
    await open('student/practice/index.html', '@/pages/practice-hub.js');
    expect(document.getElementById('hubNote').hidden).toBe(false);
    expect(text('hubContinueTitle')).toBe(grammar.lessons[0].title);
  });
});

describe('my mistakes page', () => {
  beforeEach(() => {
    loadMistakes.mockReset();
  });

  it('lists open mistakes with the answer and offers a due review', async () => {
    const q = grammar.lessons[0].questions[0];
    loadMistakes.mockResolvedValue({ a: { questionId: q.id, status: 'open', count: 2, dueAt: '2000-01-01T00:00:00.000Z' } });
    await open('student/practice/mistakes.html', '@/pages/practice-mistakes.js');
    expect(text('mistakesSummary')).toBe('1 to review · 1 due now');
    expect(text('mistakesList')).toContain(q.prompt);
    expect(text('mistakesList')).toContain(`Correct answer: ${q.options[q.answer]}`);
    expect(text('mistakesList')).toContain('Missed 2 times');
    expect(document.querySelector('#mistakesActions a').getAttribute('href')).toContain('skill=review');
  });

  it('shows an empty state', async () => {
    loadMistakes.mockResolvedValue({});
    await open('student/practice/mistakes.html', '@/pages/practice-mistakes.js');
    expect(text('mistakesSummary')).toContain('No mistakes to review');
  });

  it('says so when mistakes cannot be loaded', async () => {
    loadMistakes.mockRejectedValue(new Error('offline'));
    await open('student/practice/mistakes.html', '@/pages/practice-mistakes.js');
    expect(document.getElementById('mistakesNote').hidden).toBe(false);
  });
});
