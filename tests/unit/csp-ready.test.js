// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { h } from '@/ui/h.js';

const root = resolve(import.meta.dirname, '../..');
const pages = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? pages(path) : path.endsWith('.html') ? [path] : [];
});
const html = pages(join(root, 'src'));

describe('pages stay compatible with a strict Content-Security-Policy', () => {
  it('has pages to check', () => { expect(html.length).toBeGreaterThan(10); });

  it('no page has an inline script, an inline style attribute, or an inline event handler', () => {
    const problems = [];
    for (const file of html) {
      const text = readFileSync(file, 'utf8');
      if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(text)) problems.push(`${file}: inline <script>`);
      if (/\sstyle="/i.test(text)) problems.push(`${file}: style attribute`);
      if (/\son[a-z]+="/i.test(text)) problems.push(`${file}: inline event handler`);
    }
    expect(problems).toEqual([]);
  });

  it('h() applies styles through the CSSOM, never setAttribute("style")', () => {
    const spy = vi.spyOn(Element.prototype, 'setAttribute');
    const node = h('div', { class: 'progress', style: '--value:40%;color:red' });
    expect(spy.mock.calls.some(([name]) => name === 'style')).toBe(false);
    expect(node.style.getPropertyValue('--value')).toBe('40%');
    expect(node.style.color).toBe('red');
    spy.mockRestore();
  });
});

describe('hosting sends a Content-Security-Policy', () => {
  const headers = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8')).hosting.headers;
  const all = headers.find((entry) => entry.source === '**').headers;
  const csp = all.find((header) => /^content-security-policy/i.test(header.key));

  it('is present and covers the directives that matter', () => {
    expect(csp, 'add the CSP header to the ** rule').toBeTruthy();
    for (const directive of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
      expect(csp.value).toContain(directive);
    }
  });

  it('never allows unsafe-inline or unsafe-eval for scripts', () => {
    expect(csp.value).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  it('allows the services the app really uses', () => {
    for (const host of ['https://*.googleapis.com', 'https://api.emailjs.com', 'https://www.google.com']) expect(csp.value).toContain(host);
  });
});
