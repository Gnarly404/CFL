// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import listening from '../../src/data/practice/listening.json';
import reading from '../../src/data/practice/reading.json';
import vocabulary from '../../src/data/practice/vocabulary.json';
import { loadPage, tick } from '../helpers.js';

const save = vi.fn();
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'u1' } }) }));
const saveMistakes = vi.fn();
const loadMistakes = vi.fn();
vi.mock('@/services/practice-service.js', () => ({
  loadLessonProgress: vi.fn().mockResolvedValue({}),
  saveLessonResult: (...args) => save(...args),
  loadMistakes: (...args) => loadMistakes(...args),
  saveMistakes: (...args) => saveMistakes(...args),
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
    saveMistakes.mockReset().mockResolvedValue();
    loadMistakes.mockReset().mockResolvedValue({});
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

  it('runs a vocabulary lesson with the word list and saves under the vocabulary skill', async () => {
    const vocab = vocabulary.lessons[0];
    await open(`?skill=vocabulary&id=${vocab.id}`);
    expect(stageText()).toContain(vocab.words[0].definition);
    click('#startBtn');
    for (const q of vocab.questions) {
      await answer(q.answer);
      document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await tick();
    }
    expect(stageText()).toContain('No mistakes');
    expect(save.mock.calls[0][1]).toBe('vocabulary');
  });

  it('does not open a skill that has no content yet', async () => {
    await open('?skill=writing&id=x');
    expect(stageText()).toContain('Lesson not found');
  });

  it('records a missed question as an open mistake due in a day', async () => {
    await open(`?skill=grammar&id=${lesson.id}`);
    click('#startBtn');
    for (const [i, q] of lesson.questions.entries()) {
      await answer(i === 0 ? (q.answer + 1) % q.options.length : q.answer);
      document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await tick();
    }
    const updates = saveMistakes.mock.calls[0][1];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ skill: 'grammar', lessonId: lesson.id, questionId: lesson.questions[0].id, status: 'open', count: 1, box: 0 });
  });

  it('runs a review session from due mistakes and advances them when answered correctly', async () => {
    const q = lesson.questions[0];
    loadMistakes.mockResolvedValue({ [q.id]: { questionId: q.id, status: 'open', box: 0, count: 1, dueAt: '2000-01-01T00:00:00.000Z' } });
    await open('?skill=review');
    expect(document.getElementById('stageHeading').textContent).toBe(q.prompt);
    await answer(q.answer);
    document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await tick();
    expect(save).not.toHaveBeenCalled();
    expect(saveMistakes.mock.calls[0][1][0]).toMatchObject({ questionId: q.id, box: 1, status: 'open' });
  });

  it('says so when no mistakes are due for review', async () => {
    await open('?skill=review');
    expect(stageText()).toContain('Nothing to review right now');
  });

  it('keeps the passage on screen while answering a reading lesson', async () => {
    const lessonR = reading.lessons[0];
    await open(`?skill=reading&id=${lessonR.id}`);
    expect(stageText()).toContain(lessonR.passage.paragraphs[0]);
    click('#startBtn');
    expect(stageText()).toContain(lessonR.passage.paragraphs[0]);
    expect(document.getElementById('stageHeading').textContent).toBe(lessonR.questions[0].prompt);
  });

  it('shows the transcript up front when audio is unavailable, and after the questions otherwise', async () => {
    const lessonL = listening.lessons[0];
    await open(`?skill=listening&id=${lessonL.id}`);
    expect(stageText()).toContain('Audio is not available');
    expect(stageText()).toContain(lessonL.listening.text);
    click('#startBtn');
    for (const q of lessonL.questions) {
      await answer(q.answer);
      document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await tick();
    }
    expect(stageText()).toContain('Show transcript');
    expect(save.mock.calls[0][1]).toBe('listening');
  });
});
