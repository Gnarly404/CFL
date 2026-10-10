import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = (name) => readFileSync(resolve(import.meta.dirname, '../../src/css', name), 'utf8');

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('accent colour keeps text readable (WCAG AA is 4.5:1)', () => {
  it('the coral used for text and button backgrounds passes against white', () => {
    expect(ratio('#C8402F', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#B3321F', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // hover state
  });

  it('every page stylesheet that defines --color-accent defines a passing value, not the 2.7:1 brand coral', () => {
    for (const file of ['homepage.css', 'dashboard.css', 'programmes.css', 'registration.css']) {
      const value = css(file).match(/--color-accent:\s*(#[0-9a-fA-F]{6})/)?.[1];
      expect(value, file).toBeTruthy();
      expect(ratio(value, '#FFFFFF'), `${file} ${value}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the shared tokens declare the same strong coral', () => {
    expect(css('tokens.css')).toContain('--coral-strong:#C8402F');
    expect(css('motion.css')).toContain('--coral-strong: #c8402f');
  });

  it('the brand coral stays decorative: it fails as text, which is why it is not used for it', () => {
    expect(ratio('#FF6F61', '#FFFFFF')).toBeLessThan(3);
  });
});
