/** Pure helpers for the writing skill. These are simple checks, not a grammar review. */

export function countWords(text) {
  return (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
}

/** Basic, rule-based checks. Returns [] for empty text. Never changes the student's text. */
export function basicChecks(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const checks = [];

  const sentences = (trimmed.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
  const lowerStarts = sentences.filter((s) => /^[a-z]/.test(s)).length;
  checks.push({
    id: 'capitals',
    ok: lowerStarts === 0,
    text: lowerStarts === 0
      ? 'Every sentence starts with a capital letter.'
      : `${lowerStarts} ${lowerStarts === 1 ? 'sentence does' : 'sentences do'} not start with a capital letter.`,
  });

  const ended = /[.!?]["')\]]*$/.test(trimmed);
  checks.push({
    id: 'ending',
    ok: ended,
    text: ended ? 'The text ends with a full stop, question mark or exclamation mark.' : 'The text does not end with a full stop, question mark or exclamation mark.',
  });

  const loneI = (trimmed.match(/(^|[^A-Za-z'’])i(?![A-Za-z'’])/g) ?? []).length;
  checks.push({
    id: 'pronoun-i',
    ok: loneI === 0,
    text: loneI === 0 ? 'The word "I" is written with a capital letter.' : 'Write the word "I" with a capital letter.',
  });

  const repeats = [...new Set([...trimmed.matchAll(/\b([A-Za-z]+)\s+\1\b/gi)].map((m) => m[1].toLowerCase()))];
  checks.push({
    id: 'repeats',
    ok: repeats.length === 0,
    text: repeats.length === 0
      ? 'No repeated words next to each other.'
      : `Look at repeated words: ${repeats.map((w) => `"${w} ${w}"`).join(', ')}. Sometimes this is correct.`,
  });

  return checks;
}
