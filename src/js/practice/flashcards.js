import vocabulary from '../../data/practice/vocabulary.json';

/** Pure flashcard logic: word confidence, spaced scheduling and deck building. */

const STEP_DAYS = [1, 3, 7];
export const DECK_SIZE = 10;
const addDays = (date, days) => new Date(date.getTime() + days * 86400000).toISOString();

export const keyOf = (word) => word.toLowerCase();

/** Every vocabulary word with the lesson it comes from. */
export function allWords() {
  return vocabulary.lessons.flatMap((lesson) => lesson.words.map((w) => ({ ...w, key: keyOf(w.word), lessonId: lesson.id, lessonTitle: lesson.title })));
}

/**
 * Updates one word after the student answers. "Need practice" brings it back in a day and counts the attempt.
 * "I know this" moves it to 3 days, then 7, then it is mastered. Saying "I know this" before a word is due
 * records the attempt but does not move it forward, so repeating a deck cannot rush a word to mastered.
 */
export function reviewCard(previous, known, now = new Date()) {
  const seen = (previous?.seen ?? 0) + 1;
  const base = { seen, known: previous?.known ?? 0, needPractice: previous?.needPractice ?? 0, lastAt: now.toISOString() };
  if (!known) return { ...base, needPractice: base.needPractice + 1, box: 0, status: 'learning', dueAt: addDays(now, STEP_DAYS[0]) };
  const known1 = base.known + 1;
  if (!previous) return { ...base, known: known1, box: 1, status: 'learning', dueAt: addDays(now, STEP_DAYS[1]) };
  if (previous.status === 'mastered') return { ...previous, ...base, known: known1, status: 'mastered', box: previous.box, dueAt: null };
  if (previous.dueAt && new Date(previous.dueAt) > now) return { ...previous, ...base, known: known1 };
  const box = previous.box + 1;
  if (box >= STEP_DAYS.length) return { ...previous, ...base, known: known1, box, status: 'mastered', dueAt: null };
  return { ...previous, ...base, known: known1, box, status: 'learning', dueAt: addDays(now, STEP_DAYS[box]) };
}

export const isDue = (record, now = new Date()) => record.status === 'learning' && (!record.dueAt || new Date(record.dueAt) <= now);

/** Due words first (oldest due first), then words never seen, up to `size`. */
export function buildDeck(progress, words = allWords(), now = new Date(), size = DECK_SIZE) {
  const due = words.filter((w) => progress[w.key] && isDue(progress[w.key], now))
    .sort((a, b) => String(progress[a.key].dueAt).localeCompare(String(progress[b.key].dueAt)));
  const fresh = words.filter((w) => !progress[w.key]);
  return [...due, ...fresh].slice(0, size);
}

export function deckCounts(progress, words = allWords(), now = new Date()) {
  return {
    due: words.filter((w) => progress[w.key] && isDue(progress[w.key], now)).length,
    fresh: words.filter((w) => !progress[w.key]).length,
    mastered: words.filter((w) => progress[w.key]?.status === 'mastered').length,
    total: words.length,
  };
}
