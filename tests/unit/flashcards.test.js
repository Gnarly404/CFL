import { describe, expect, it } from 'vitest';
import { allWords, buildDeck, deckCounts, reviewCard } from '@/practice/flashcards.js';

const now = new Date('2026-10-10T08:00:00.000Z');
const days = (n) => new Date(now.getTime() + n * 86400000).toISOString();

describe('reviewCard', () => {
  it('"Need practice" brings the word back in a day and counts it', () => {
    expect(reviewCard(null, false, now)).toMatchObject({ box: 0, status: 'learning', dueAt: days(1), needPractice: 1, seen: 1, known: 0 });
    expect(reviewCard({ box: 2, status: 'learning', dueAt: days(5), seen: 4, known: 3, needPractice: 1 }, false, now)).toMatchObject({ box: 0, dueAt: days(1), needPractice: 2, seen: 5 });
  });
  it('a new word known straight away is checked again in 3 days', () => {
    expect(reviewCard(null, true, now)).toMatchObject({ box: 1, status: 'learning', dueAt: days(3), known: 1 });
  });
  it('does not advance a word that is not due yet', () => {
    const before = { box: 1, status: 'learning', dueAt: days(3), seen: 1, known: 1, needPractice: 0 };
    expect(reviewCard(before, true, now)).toMatchObject({ box: 1, dueAt: days(3), seen: 2, known: 2 });
  });
  it('moves a due word to 7 days and then masters it', () => {
    const due = { box: 1, status: 'learning', dueAt: days(-1), seen: 1, known: 1, needPractice: 0 };
    const two = reviewCard(due, true, now);
    expect(two).toMatchObject({ box: 2, dueAt: days(7), status: 'learning' });
    expect(reviewCard({ ...two, dueAt: days(-1) }, true, now)).toMatchObject({ status: 'mastered', dueAt: null });
  });
  it('keeps a mastered word mastered when known again', () => {
    expect(reviewCard({ box: 3, status: 'mastered', dueAt: null, seen: 3, known: 3, needPractice: 0 }, true, now)).toMatchObject({ status: 'mastered', dueAt: null, seen: 4 });
  });
});

describe('decks', () => {
  const words = allWords();
  it('has unique keys for every vocabulary word', () => {
    expect(new Set(words.map((w) => w.key)).size).toBe(words.length);
    expect(words.length).toBe(24);
  });
  it('puts due words first, then new words, at most ten', () => {
    const progress = { [words[5].key]: { status: 'learning', dueAt: days(-2) }, [words[0].key]: { status: 'learning', dueAt: days(-1) }, [words[1].key]: { status: 'learning', dueAt: days(2) }, [words[2].key]: { status: 'mastered', dueAt: null } };
    const deck = buildDeck(progress, words, now);
    expect(deck).toHaveLength(10);
    expect(deck.slice(0, 2).map((w) => w.key)).toEqual([words[5].key, words[0].key]);
    expect(deck.map((w) => w.key)).not.toContain(words[1].key);
    expect(deck.map((w) => w.key)).not.toContain(words[2].key);
  });
  it('counts due, new and mastered words', () => {
    const progress = { [words[0].key]: { status: 'learning', dueAt: days(-1) }, [words[1].key]: { status: 'mastered', dueAt: null } };
    expect(deckCounts(progress, words, now)).toEqual({ due: 1, fresh: 22, mastered: 1, total: 24 });
  });
});
