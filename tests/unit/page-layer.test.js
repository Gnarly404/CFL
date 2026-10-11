import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every page must carry the shared font, motion and page-transition layer. If you add a page, copy the
// head from any existing page (see docs/MOTION-AND-VOICE.md); this test tells you what is missing.
const src = resolve(import.meta.dirname, '../../src');
const pages = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? pages(path) : path.endsWith('.html') ? [path] : [];
});

describe('every page carries the font, motion and page-transition layer', () => {
  const all = pages(src);
  it('has pages to check', () => { expect(all.length).toBeGreaterThan(15); });

  for (const file of all) {
    const name = file.slice(src.length + 1).replaceAll('\\', '/');
    it(name, () => {
      const html = readFileSync(file, 'utf8');
      expect(html, 'start with <html data-veil="on"> so the first paint is the ink cover').toMatch(/<html[^>]*\sdata-veil="on"/);
      expect(html, 'link /css/fonts.css').toContain('href="/css/fonts.css"');
      expect(html, 'link /css/motion.css').toContain('href="/css/motion.css"');
      expect(html, 'load /js/motion/boot.js').toContain('src="/js/motion/boot.js"');
      expect(html, 'fonts are self-hosted: remove Google Fonts links').not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    });
  }
});
