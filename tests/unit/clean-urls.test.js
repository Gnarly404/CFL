import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { resolveCleanUrl } from '../../scripts/clean-urls.mjs';

const src = resolve(import.meta.dirname, '../../src');

describe('clean URLs in the dev and preview servers', () => {
  it('maps a folder page and a file page the way the live site does', () => {
    expect(resolveCleanUrl('/programmes', src)).toBe('/programmes/index.html');
    expect(resolveCleanUrl('/programmes/', src)).toBe('/programmes/index.html');
    expect(resolveCleanUrl('/gallery', src)).toBe('/gallery.html');
    expect(resolveCleanUrl('/student/practice', src)).toBe('/student/practice/index.html');
    expect(resolveCleanUrl('/student/schedule', src)).toBe('/student/schedule.html');
    expect(resolveCleanUrl('/privacy', src)).toBe('/privacy.html');
  });
  it('leaves everything else alone', () => {
    expect(resolveCleanUrl('/', src)).toBeNull();
    expect(resolveCleanUrl('/nothing-here', src)).toBeNull();
    expect(resolveCleanUrl('/css/tokens.css', src)).toBeNull();
    expect(resolveCleanUrl('/js/pages/x.js', src)).toBeNull();
    expect(resolveCleanUrl('/../package.json', src)).toBeNull();
    expect(resolveCleanUrl('/..%2f', src)).toBeNull();
    expect(resolveCleanUrl('programmes', src)).toBeNull();
  });
});
