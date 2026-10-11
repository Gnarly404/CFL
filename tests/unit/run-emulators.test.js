import { describe, expect, it } from 'vitest';
import { emulatorArgs } from '../../scripts/run-emulators.mjs';

describe('emulator start arguments', () => {
  it('imports saved data only when it exists, and always exports on exit', () => {
    const first = emulatorArgs(false);
    expect(first).not.toContain('--import');
    expect(first).toEqual(expect.arrayContaining(['--project', 'demo-cfl', '--export-on-exit', 'emulator-data']));
    const later = emulatorArgs(true);
    expect(later.slice(later.indexOf('--import'), later.indexOf('--import') + 2)).toEqual(['--import', 'emulator-data']);
  });
});
