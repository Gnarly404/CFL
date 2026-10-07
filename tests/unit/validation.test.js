import { describe, expect, it } from 'vitest';
import {
  cleanText, normaliseEmail, normalisePhone, validateDateOfBirth, validateEmail, validateName, validatePassword, validatePhone,
} from '@/utils/validation.js';

const NOW = new Date('2026-10-06T12:00:00Z');

describe('validateName', () => {
  it.each(['Wanjiku', 'Mary-Anne', "O'Brien", 'Zoë Müller', "Ng'ang'a", 'Jean de la Fontaine'])('accepts %s', (name) => {
    expect(validateName(name)).toBeNull();
  });
  it.each(['', '   ', 'A', 'J0hn', 'Bob<script>', '12', '-Bob'])('rejects %j', (name) => {
    expect(validateName(name)).not.toBeNull();
  });
  it('allows an optional name to be empty', () => {
    expect(validateName('', { required: false })).toBeNull();
  });
  it('rejects names over 60 characters', () => {
    expect(validateName('a'.repeat(61))).toMatch(/60 characters/);
  });
});

describe('email', () => {
  it('normalises case and whitespace', () => {
    expect(normaliseEmail('  Name@Example.COM ')).toBe('name@example.com');
  });
  it.each(['a@b.co', 'first.last+tag@sub.example.org'])('accepts %s', (email) => {
    expect(validateEmail(email)).toBeNull();
  });
  it.each(['', 'a@b', 'a b@c.com', 'a@b.c', 'no-at-sign.com'])('rejects %j', (email) => {
    expect(validateEmail(email)).not.toBeNull();
  });
});

describe('normalisePhone', () => {
  it.each([
    ['0712 345 678', '+254712345678'],
    ['0112345678', '+254112345678'],
    ['+254712345678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['(0712) 345-678', '+254712345678'],
    ['+44 20 7946 0958', '+442079460958'],
    ['0044 20 7946 0958', '+442079460958'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalisePhone(raw)).toBe(expected);
  });
  it.each(['', 'abc', '0712', '12345678', '+0712345678', '07123456789', '+254'])('rejects %j', (raw) => {
    expect(normalisePhone(raw)).toBeNull();
    expect(validatePhone(raw)).not.toBeNull();
  });
});

describe('validateDateOfBirth', () => {
  it('accepts a real date for a school-age student', () => {
    expect(validateDateOfBirth('2012-05-14', { now: NOW })).toBeNull();
  });
  it('rejects the future, impossible dates and bad formats', () => {
    expect(validateDateOfBirth('2026-10-07', { now: NOW })).toMatch(/future/);
    expect(validateDateOfBirth('2023-02-30', { now: NOW })).toMatch(/does not exist/);
    expect(validateDateOfBirth('06/10/2015', { now: NOW })).toMatch(/day, month and year/);
    expect(validateDateOfBirth('', { now: NOW })).not.toBeNull();
  });
  it('enforces the age range on the birthday itself', () => {
    expect(validateDateOfBirth('2022-10-06', { now: NOW })).toBeNull(); // turns 4 today
    expect(validateDateOfBirth('2022-10-07', { now: NOW })).toMatch(/at least 4/);
    expect(validateDateOfBirth('1900-01-01', { now: NOW })).toMatch(/year of birth/);
  });
});

describe('validatePassword', () => {
  it('accepts a reasonable password', () => {
    expect(validatePassword('Mango-trees-2026')).toEqual([]);
  });
  it('lists every problem', () => {
    expect(validatePassword('short')).toEqual(expect.arrayContaining(['Use at least 8 characters.', 'Include at least one number.']));
    expect(validatePassword('allletters')).toEqual(['Include at least one number.']);
    expect(validatePassword('12345678')).toEqual(expect.arrayContaining(['Include at least one letter.']));
  });
  it('rejects common passwords and passwords containing the email name', () => {
    expect(validatePassword('Password1')).toEqual(['That password is too common.']);
    expect(validatePassword('wanjiku2026x', { email: 'wanjiku@example.com' })).toEqual(['Do not include your email name.']);
  });
});

describe('cleanText', () => {
  it('collapses whitespace', () => {
    expect(cleanText('  Mary   Anne ')).toBe('Mary Anne');
    expect(cleanText(undefined)).toBe('');
  });
});
