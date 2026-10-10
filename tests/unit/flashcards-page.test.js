// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage, tick } from '../helpers.js';

const loadWordProgress = vi.fn();
const saveWordProgress = vi.fn();
const recordSession = vi.fn();
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'u1' } }) }));
vi.mock('@/services/practice-service.js', () => ({
  loadWordProgress: (...a) => loadWordProgress(...a),
  saveWordProgress: (...a) => saveWordProgress(...a),
  recordSession: (...a) => recordSession(...a),
}));

const stage = () => document.getElementById('stage').textContent;
const press = async (id) => { document.getElementById(id).click(); await tick(); };

async function open() {
  vi.resetModules();
  loadPage('student/practice/flashcards.html');
  await import('@/pages/practice-flashcards.js');
  await tick();
}

describe('flashcards page', () => {
  beforeEach(() => {
    loadWordProgress.mockReset().mockResolvedValue({});
    saveWordProgress.mockReset().mockResolvedValue();
    recordSession.mockReset().mockResolvedValue();
  });

  it('shows a word first, reveals the meaning on request, and saves honest answers', async () => {
    await open();
    expect(stage()).toContain('10 words today');
    await press('go');
    expect(stage()).toContain('Word 1 of 10');
    expect(document.getElementById('know')).toBeNull();
    await press('flip');
    expect(stage()).toContain('Meaning');
    await press('need');
    for (let i = 1; i < 10; i += 1) { await press('flip'); await press('know'); }
    expect(stage()).toContain('9 of 10 words known');
    expect(stage()).toContain('Progress saved.');
    const saved = saveWordProgress.mock.calls[0][1];
    expect(Object.keys(saved)).toHaveLength(10);
    expect(Object.values(saved).filter((r) => r.needPractice === 1)).toHaveLength(1);
    expect(recordSession.mock.calls[0][1]).toMatchObject({ skill: 'vocabulary', lessonId: 'flashcards', kind: 'flashcards' });
  });

  it('says so when nothing is due', async () => {
    const all = {};
    const { allWords } = await import('@/practice/flashcards.js');
    allWords().forEach((w) => { all[w.key] = { status: 'mastered', dueAt: null }; });
    loadWordProgress.mockResolvedValue(all);
    await open();
    expect(stage()).toContain('Nothing to review right now');
    expect(stage()).toContain('24 of 24 words mastered');
  });

  it('turns flashcards off when saved words cannot be loaded', async () => {
    loadWordProgress.mockRejectedValue(new Error('offline'));
    await open();
    expect(stage()).toContain('turned off');
    expect(document.getElementById('go')).toBeNull();
  });

  it('keeps the results and offers a retry when saving fails', async () => {
    saveWordProgress.mockRejectedValue(new Error('offline'));
    await open();
    await press('go');
    for (let i = 0; i < 10; i += 1) { await press('flip'); await press('know'); }
    expect(stage()).toContain('could not be saved');
    expect(document.getElementById('retry')).not.toBeNull();
    expect(recordSession).not.toHaveBeenCalled();
  });
});
