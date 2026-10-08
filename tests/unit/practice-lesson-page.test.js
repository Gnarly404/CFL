// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import listening from '../../src/data/practice/listening.json';
import reading from '../../src/data/practice/reading.json';
import speaking from '../../src/data/practice/speaking.json';
import writing from '../../src/data/practice/writing.json';
import vocabulary from '../../src/data/practice/vocabulary.json';
import { loadPage, tick } from '../helpers.js';

const save = vi.fn();
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'u1' } }) }));
const saveMistakes = vi.fn();
const loadSubmission = vi.fn();
const createDraft = vi.fn();
const updateDraft = vi.fn();
const submitDraft = vi.fn();
const loadMistakes = vi.fn();
vi.mock('@/services/practice-service.js', () => ({
  loadLessonProgress: vi.fn().mockResolvedValue({}),
  saveLessonResult: (...args) => save(...args),
  loadMistakes: (...args) => loadMistakes(...args),
  saveMistakes: (...args) => saveMistakes(...args),
  loadSubmission: (...args) => loadSubmission(...args),
  createDraft: (...args) => createDraft(...args),
  updateDraft: (...args) => updateDraft(...args),
  submitDraft: (...args) => submitDraft(...args),
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
    loadSubmission.mockReset().mockResolvedValue(null);
    createDraft.mockReset().mockResolvedValue();
    updateDraft.mockReset().mockResolvedValue();
    submitDraft.mockReset().mockResolvedValue();
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
    await open('?skill=nope&id=x');
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

  describe('speaking lessons', () => {
    const lessonS = speaking.lessons[0];
    const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

    function installRecorder() {
      window.MediaRecorder = class {
        static isTypeSupported() { return true; }
        constructor() { this.state = 'inactive'; }
        start() { this.state = 'recording'; }
        stop() { this.ondataavailable?.({ data: new Blob(['a']) }); this.onstop?.(); }
      };
      Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }) } });
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();
    }
    afterEach(() => {
      delete window.MediaRecorder;
      delete window.navigator.mediaDevices;
    });

    it('explains that recording is unavailable and offers no start button', async () => {
      await open(`?skill=speaking&id=${lessonS.id}`);
      expect(stageText()).toContain('Recording is not available');
      expect(document.getElementById('startBtn')).toBeNull();
    });

    it('records each prompt, saves completion without a score, and never uploads audio', async () => {
      installRecorder();
      await open(`?skill=speaking&id=${lessonS.id}`);
      expect(stageText()).toContain(lessonS.phrases[0]);
      expect(stageText()).toContain('not uploaded');
      click('#startBtn');
      for (const prompt of lessonS.prompts) {
        expect(document.getElementById('stageHeading').textContent).toBe(prompt.text);
        const nextBtn = [...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Next prompt' || b.textContent === 'Finish');
        expect(nextBtn.disabled).toBe(true);
        const [startRec] = document.querySelectorAll('.player button');
        startRec.click(); await flush(); startRec.click();
        expect(nextBtn.disabled).toBe(false);
        document.getElementById('check-0').click();
        nextBtn.click();
        await tick();
      }
      expect(stageText()).toContain(`${lessonS.prompts.length} of ${lessonS.prompts.length} answers recorded`);
      expect(stageText()).toContain(`Self-check: ${lessonS.prompts.length} of ${lessonS.prompts.length * 3} ticked.`);
      const [, skillId, lessonId, result] = save.mock.calls[0];
      expect([skillId, lessonId]).toEqual(['speaking', lessonS.id]);
      expect(result.percent).toBeNull();
      expect(result.extra.recordedPrompts).toBe(lessonS.prompts.length);
    });

    it('does not mark the lesson done when nothing was recorded', async () => {
      installRecorder();
      await open(`?skill=speaking&id=${lessonS.id}`);
      click('#startBtn');
      for (let i = 0; i < lessonS.prompts.length; i += 1) {
        [...document.querySelectorAll('.actions button')].find((b) => b.textContent === 'Skip this prompt').click();
        await tick();
      }
      expect(stageText()).toContain('not marked as done');
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('writing lessons', () => {
    const lessonW = writing.lessons[2];
    const cfg = lessonW.writing;
    const words = (n) => `${Array.from({ length: n }, () => 'word').join(' ')}.`.replace(/^word/, 'Word');
    const box = () => document.getElementById('writingText');
    const type = (text) => { box().value = text; box().dispatchEvent(new Event('input', { bubbles: true })); };
    const btn = (label) => [...document.querySelectorAll('.actions button')].find((b) => b.textContent === label);
    const flushAll = () => new Promise((resolve) => { setTimeout(resolve, 0); });

    it('shows the topic, target and plan, and keeps submit disabled until the minimum', async () => {
      await open(`?skill=writing&id=${lessonW.id}`);
      expect(stageText()).toContain(cfg.topic);
      expect(stageText()).toContain(`${cfg.minWords} to ${cfg.maxWords} words`);
      expect(stageText()).toContain(cfg.phrases[0]);
      type(words(cfg.minWords - 1));
      expect(document.getElementById('wordCount').textContent).toContain(`${cfg.minWords - 1} / ${cfg.minWords} words`);
      expect(btn('Submit').disabled).toBe(true);
      type(words(cfg.minWords));
      expect(btn('Submit').disabled).toBe(false);
    });

    it('creates the draft once, then updates it, without changing the text', async () => {
      await open(`?skill=writing&id=${lessonW.id}`);
      type('Dear Anna, come for lunch.');
      btn('Save draft').click(); await flushAll();
      expect(createDraft).toHaveBeenCalledTimes(1);
      expect(createDraft.mock.calls[0][1]).toMatchObject({ skill: 'writing', lessonId: lessonW.id, promptId: cfg.promptId, content: 'Dear Anna, come for lunch.' });
      expect(document.getElementById('saveStatus').textContent).toContain('Draft saved');
      type('Dear Anna, come for lunch on Saturday.');
      btn('Save draft').click(); await flushAll();
      expect(createDraft).toHaveBeenCalledTimes(1);
      expect(updateDraft).toHaveBeenCalledWith('u1', cfg.promptId, 'Dear Anna, come for lunch on Saturday.');
      expect(box().value).toBe('Dear Anna, come for lunch on Saturday.');
    });

    it('autosaves after the student stops typing', async () => {
      await open(`?skill=writing&id=${lessonW.id}`);
      vi.useFakeTimers();
      type('A short draft.');
      await vi.advanceTimersByTimeAsync(2100);
      vi.useRealTimers();
      expect(createDraft).toHaveBeenCalledTimes(1);
    });

    it('loads an existing draft into the editor', async () => {
      loadSubmission.mockResolvedValue({ status: 'draft', content: 'My saved draft.' });
      await open(`?skill=writing&id=${lessonW.id}`);
      expect(box().value).toBe('My saved draft.');
    });

    it('needs a second click to submit, then locks the writing and records progress', async () => {
      loadSubmission.mockResolvedValue({ status: 'draft', content: words(cfg.minWords) });
      await open(`?skill=writing&id=${lessonW.id}`);
      btn('Submit').click(); await flushAll();
      expect(submitDraft).not.toHaveBeenCalled();
      expect(stageText()).toContain('cannot edit');
      btn('Confirm submit').click(); await flushAll(); await flushAll();
      expect(submitDraft).toHaveBeenCalledWith('u1', cfg.promptId, words(cfg.minWords));
      expect(document.getElementById('writingText')).toBeNull();
      expect(stageText()).toContain('can no longer be edited');
      expect(save.mock.calls[0][3]).toMatchObject({ percent: null, extra: { wordCount: cfg.minWords } });
    });

    it('shows submitted work read-only', async () => {
      loadSubmission.mockResolvedValue({ status: 'submitted', content: 'Dear Anna, i like lunch.' });
      await open(`?skill=writing&id=${lessonW.id}`);
      expect(document.getElementById('writingText')).toBeNull();
      expect(stageText()).toContain('Dear Anna, i like lunch.');
      expect(stageText()).toContain('Write the word "I" with a capital letter.');
    });

    it('keeps the text and says so when a save fails', async () => {
      createDraft.mockRejectedValue(new Error('offline'));
      await open(`?skill=writing&id=${lessonW.id}`);
      type('Hello friend.');
      btn('Save draft').click(); await flushAll();
      expect(document.getElementById('saveStatus').textContent).toContain('could not be saved');
      expect(box().value).toBe('Hello friend.');
    });

    it('turns editing off when the saved writing cannot be loaded', async () => {
      loadSubmission.mockRejectedValue(new Error('offline'));
      await open(`?skill=writing&id=${lessonW.id}`);
      expect(stageText()).toContain('editing is turned off');
      expect(document.getElementById('writingText')).toBeNull();
    });
  });
});

