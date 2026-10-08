import { describe, expect, it } from 'vitest';
import { basicChecks, countWords } from '@/practice/writing.js';

const failed = (text) => basicChecks(text).filter((c) => !c.ok).map((c) => c.id);

describe('countWords', () => {
  it('counts words, contractions and hyphenated words as one', () => {
    expect(countWords('I do not like tea.')).toBe(5);
    expect(countWords("It's a well-known place.")).toBe(4);
    expect(countWords('  \n ')).toBe(0);
    expect(countWords('Meet me at 5 pm!')).toBe(5);
  });
});

describe('basicChecks', () => {
  it('returns nothing for empty text', () => {
    expect(basicChecks('   ')).toEqual([]);
  });
  it('passes clean text', () => {
    expect(failed('I live in Eldoret. It is a nice town. I like it!')).toEqual([]);
  });
  it('flags sentences that start with a lowercase letter', () => {
    expect(failed('I live here. it is nice.')).toEqual(['capitals']);
    expect(basicChecks('a. b.').find((c) => c.id === 'capitals').text).toContain('2 sentences do');
  });
  it('flags missing end punctuation', () => {
    expect(failed('I live here')).toEqual(['ending']);
    expect(failed('He said "hello."')).toEqual([]);
  });
  it('flags a lowercase pronoun I but not letters inside words', () => {
    expect(failed('Today i went home.')).toEqual(['pronoun-i']);
    expect(failed('This is it. I did it.')).toEqual([]);
  });
  it('points out repeated words without calling them wrong', () => {
    const check = basicChecks('I went to the the market.').find((c) => c.id === 'repeats');
    expect(check.ok).toBe(false);
    expect(check.text).toContain('"the the"');
    expect(check.text).toContain('Sometimes this is correct');
  });
});
