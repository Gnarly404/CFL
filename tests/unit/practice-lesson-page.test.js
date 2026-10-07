// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import { loadPage, tick } from '../helpers.js';

const save = vi.fn();
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'u1' } }) }));
vi.mock('@/services/practice-service.js', () => ({
  loadLessonProgress: vi.fn().mockResolvedValue({}),
  saveLessonResult: (...args) => save(...args),
}));

const lesson = grammar.lessons[0];
const stageText = () => document.getElementById('stage').textContent;
const click = (selector) => document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));

async function open(search) {
  vi.resetModules();
  loadPage('student/practice/lesson.html');
  window.history.replaceState({}, '', `/student/practice/lesson${search}`);
  await import('@/pages/practice-lesson.js');
  await tick();
}

async function answer(optionIndex) {
  document.querySelector(`#opt-${optionIndex}`).click();
  document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await tick();
}

describe('practice lesson page', () => {
  beforeEach(() => {
    save.mockReset().mockImplementation(async (_u, _s, _id, result) => ({ ...result, attempts: 1, bestPercent: result.percent }));
  });

  it('shows a friendly message for an unknown lesson', async () => {
    await open('?skill=grammar&id=nope');
    expect(stageText()).toContain('Lesson not found');
  });

  it('runs learn, practice, feedback and results, saving once', async () => {
    await open(`?skill=grammar&id=${lesson.id}`);
    expect(stageText()).toContain(lesson.rule[0]);
    click('#startBtn');
    for (const [i, q] of lesson.questions.entries()) {
      expect(document.getElementById('stageHeading').textContent).toBe(q.prompt);
      // Wrong answer on the first question, right on the rest.
      await answer(i === 0 ? (q.answer + 1) % q.options.length : q.answer);
      expect(stageText()).toContain(q.why);
      document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await tick();
    }
    expect(stageText()).toContain(`${lesson.questions.length - 1} of ${lesson.questions.length}`);
    expect(stageText()).toContain('Review your mistakes');
    expect(stageText()).toContain('Progress saved.');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][3].mistakes).toEqual([lesson.questions[0].id]);
  });

  it('asks for an answer before checking', async () => {
    await open(`?skill=grammar&id=${lesson.id}`);
    click('#startBtn');
    document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await tick();
    expect(stageText()).toContain('Choose an answer first.');
  });

  it('tells the student when saving fails', async () => {
    save.mockRejectedValue(new Error('offline'));
    await open(`?skill=grammar&id=${lesson.id}`);
    click('#startBtn');
    for (const q of lesson.questions) {
      await answer(q.answer);
      document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await tick();
    }
    expect(stageText()).toContain('could not be saved');
    expect(document.getElementById('retrySave')).not.toBeNull();
  });
});
