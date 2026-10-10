/** Pure helpers for teacher feedback on writing. Feedback is stored apart from the student's text, which is never edited. */

export const MAX_OVERALL = 2000;
export const MAX_NOTE = 600;
export const MAX_NOTES = 20;

/** Trims and checks feedback against the student's text. Returns { errors, value }. */
export function cleanFeedback({ overall, notes }, text) {
  const errors = [];
  const summary = (overall ?? '').trim();
  const kept = (notes ?? []).map((n) => ({ quote: (n.quote ?? '').trim(), note: (n.note ?? '').trim() })).filter((n) => n.quote || n.note);
  if (!summary && !kept.length) errors.push('Write an overall comment or at least one note.');
  if (summary.length > MAX_OVERALL) errors.push(`The overall comment is too long (maximum ${MAX_OVERALL} characters).`);
  if (kept.length > MAX_NOTES) errors.push(`Use at most ${MAX_NOTES} notes.`);
  kept.forEach((n, i) => {
    if (!n.note) errors.push(`Note ${i + 1} needs a comment.`);
    if (n.note.length > MAX_NOTE) errors.push(`Note ${i + 1} is too long (maximum ${MAX_NOTE} characters).`);
    if (n.quote && !text.includes(n.quote)) errors.push(`Note ${i + 1}: the quoted words are not in the student's writing exactly as typed.`);
  });
  return { errors, value: { overall: summary, notes: kept } };
}

/**
 * Splits the student's text into pieces so quoted passages can be marked, without changing a character of it.
 * Each note marks the first place its quote appears; a quote overlapping an earlier one is left unmarked.
 * Returns [{ text, note }] where note is the 0-based note index or null.
 */
export function segments(text, notes) {
  const found = [];
  notes.forEach((n, index) => {
    if (!n.quote) return;
    const start = text.indexOf(n.quote);
    if (start >= 0) found.push({ start, end: start + n.quote.length, index });
  });
  found.sort((a, b) => a.start - b.start);
  const out = [];
  let cursor = 0;
  for (const range of found) {
    if (range.start < cursor) continue;
    if (range.start > cursor) out.push({ text: text.slice(cursor, range.start), note: null });
    out.push({ text: text.slice(range.start, range.end), note: range.index });
    cursor = range.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), note: null });
  return out.length ? out : [{ text, note: null }];
}
