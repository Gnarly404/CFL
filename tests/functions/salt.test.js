import { describe, expect, it } from 'vitest';
import { MIN_SALT_LENGTH, resolveSalt } from '../../functions/src/lib/salt.js';

const GOOD = 'a1b2c3d4e5f6a7b8c9d0';

describe('resolveSalt', () => {
  it('returns a long random value unchanged (trimmed)', () => {
    expect(resolveSalt(`  ${GOOD}  `)).toBe(GOOD);
  });

  it('refuses a missing, empty or non-string value outside the emulator', () => {
    for (const value of [undefined, null, '', '   ', 42]) {
      expect(() => resolveSalt(value)).toThrow(/IP_HASH_SALT/);
    }
  });

  it('refuses a value shorter than the minimum', () => {
    expect(() => resolveSalt('x'.repeat(MIN_SALT_LENGTH - 1))).toThrow(/IP_HASH_SALT/);
    expect(resolveSalt('x'.repeat(MIN_SALT_LENGTH))).toHaveLength(MIN_SALT_LENGTH);
  });

  it('refuses the old default and the example placeholder, in any case', () => {
    for (const value of ['cfl', 'CFL', 'change-me-to-a-random-string', 'Change-Me-To-A-Random-String']) {
      expect(() => resolveSalt(value)).toThrow(/IP_HASH_SALT/);
    }
  });

  it('falls back to a fixed local value only in the emulator', () => {
    expect(resolveSalt('', { emulator: true })).toBe('cfl-local');
    expect(resolveSalt(undefined, { emulator: true })).toBe('cfl-local');
    expect(resolveSalt(GOOD, { emulator: true })).toBe(GOOD);
  });
});
