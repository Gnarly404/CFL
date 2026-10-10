import { describe, expect, it } from 'vitest';
import { cleanFeedback, segments } from '@/review/feedback.js';

const text = 'I live in Eldoret. It is a big town. I like it.';

describe('cleanFeedback', () => {
  it('needs an overall comment or a note', () => {
    expect(cleanFeedback({ overall: '  ', notes: [{ quote: '', note: '' }] }, text).errors).toEqual(['Write an overall comment or at least one note.']);
  });
  it('trims and drops empty rows', () => {
    const { errors, value } = cleanFeedback({ overall: ' Good. ', notes: [{ quote: ' It is a big town ', note: ' Add why. ' }, { quote: '', note: '' }] }, text);
    expect(errors).toEqual([]);
    expect(value).toEqual({ overall: 'Good.', notes: [{ quote: 'It is a big town', note: 'Add why.' }] });
  });
  it('rejects a quote that is not in the writing exactly, and a note with no comment', () => {
    const { errors } = cleanFeedback({ overall: 'Ok', notes: [{ quote: 'it is a big town', note: 'case' }, { quote: 'I like it.', note: '' }] }, text);
    expect(errors).toEqual(["Note 1: the quoted words are not in the student's writing exactly as typed.", 'Note 2 needs a comment.']);
  });
  it('enforces length limits', () => {
    expect(cleanFeedback({ overall: 'x'.repeat(2001), notes: [] }, text).errors[0]).toContain('too long');
    expect(cleanFeedback({ overall: 'ok', notes: [{ quote: '', note: 'y'.repeat(601) }] }, text).errors[0]).toContain('Note 1 is too long');
    expect(cleanFeedback({ overall: 'ok', notes: Array.from({ length: 21 }, () => ({ quote: '', note: 'n' })) }, text).errors[0]).toContain('at most 20');
  });
});

describe('segments', () => {
  it('splits the text around quotes and rejoins to exactly the original', () => {
    const parts = segments(text, [{ quote: 'I like it.', note: 'b' }, { quote: 'Eldoret', note: 'a' }]);
    expect(parts.map((p) => p.note)).toEqual([null, 1, null, 0]);
    expect(parts.map((p) => p.text).join('')).toBe(text);
  });
  it('returns the whole text when there are no usable quotes', () => {
    expect(segments(text, [])).toEqual([{ text, note: null }]);
    expect(segments(text, [{ quote: 'missing', note: 'x' }, { quote: '', note: 'y' }])).toEqual([{ text, note: null }]);
  });
  it('skips a quote that overlaps an earlier one', () => {
    const parts = segments(text, [{ quote: 'live in Eldoret', note: 'a' }, { quote: 'in Eldoret. It', note: 'b' }]);
    expect(parts.filter((p) => p.note !== null).map((p) => p.note)).toEqual([0]);
    expect(parts.map((p) => p.text).join('')).toBe(text);
  });
  it('keeps text safe: it is plain strings, never markup', () => {
    const risky = 'a <b>bold</b> claim';
    expect(segments(risky, [{ quote: '<b>bold</b>', note: 'x' }]).map((p) => p.text).join('')).toBe(risky);
  });
});
