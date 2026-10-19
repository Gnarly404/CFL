// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expandIncludes } from '../../scripts/html-partials.mjs';
import { CONTACT_EMAIL, initContactForm, mailtoUrl } from '@/pages/contact-form.js';

const root = resolve(import.meta.dirname, '../..');
const partials = join(root, 'partials');
const read = (path) => readFileSync(join(root, path), 'utf8');
const expanded = (path) => expandIncludes(read(path), partials);
const allHtml = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? allHtml(full) : full.endsWith('.html') ? [full] : [];
});

describe('shared header and footer', () => {
  it('expands includes, and fails loudly for an unknown partial', () => {
    expect(expandIncludes('<body>\n  <!-- @include site-nav -->\n</body>', partials)).toContain('class="navbar"');
    expect(() => expandIncludes('<!-- @include nope -->', partials)).toThrow(/Missing HTML partial "nope"/);
  });

  it('every page that uses the markers resolves them, and leaves none behind', () => {
    const pages = allHtml(join(root, 'src')).filter((file) => readFileSync(file, 'utf8').includes('@include'));
    expect(pages.length).toBeGreaterThanOrEqual(4); // home, programmes, privacy, terms
    for (const file of pages) expect(expandIncludes(readFileSync(file, 'utf8'), partials), file).not.toContain('@include');
  });

  it('the public pages with a header and footer all use the shared partials rather than their own copies', () => {
    for (const page of ['src/index.html', 'src/programmes/index.html', 'src/privacy.html', 'src/terms.html']) {
      const source = read(page);
      expect(source, page).toContain('@include site-nav');
      expect(source, page).toContain('@include site-footer');
      expect(source, page).not.toContain('<footer');
    }
  });

  it('links only to real pages, and the footer reaches the legal pages', () => {
    const footer = read('partials/site-footer.html');
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/terms"');
    expect(read('partials/site-nav.html')).toContain('href="/#contacts"');
    expect(footer).not.toMatch(/href="#(about|courses|gallery)"/);
  });

  it('keeps the four social icons as placeholders, as requested', () => {
    expect(read('partials/site-footer.html').match(/class="social-icon"/g)).toHaveLength(4);
  });

  it('has exactly one h1 on every page that uses the shared header', () => {
    for (const page of ['src/index.html', 'src/programmes/index.html', 'src/privacy.html', 'src/terms.html']) {
      expect((expanded(page).match(/<h1[\s>]/g) ?? []).length, page).toBe(1);
    }
  });

  it('shows the same contact email the form sends to', () => {
    expect(read('partials/site-footer.html')).toContain(CONTACT_EMAIL);
  });
});

describe('Privacy and Terms pages', () => {
  for (const page of ['src/privacy.html', 'src/terms.html']) {
    it(`${page}: every contents link points at a heading that exists`, () => {
      const html = read(page);
      const targets = [...html.matchAll(/class="legal-toc"[\s\S]*?<\/ol>/g)][0][0].match(/href="#([a-z-]+)"/g).map((h) => h.slice(7, -1));
      expect(targets.length).toBeGreaterThanOrEqual(10);
      for (const id of targets) expect(html, `${page} #${id}`).toContain(`id="${id}"`);
    });
  }

  it('the privacy policy states the facts the code relies on', () => {
    const html = read('src/privacy.html');
    for (const phrase of ['Data Protection Act, 2019', 'odpc.go.ke', 'not uploaded to us', 'email delivery provider', 'Google Maps', 'Keep me signed in']) expect(html, phrase).toContain(phrase);
  });
});

describe('contact form', () => {
  const setup = () => {
    document.body.innerHTML = read('partials/site-footer.html').replace(/<script[\s\S]*?<\/script>/, '');
    const open = vi.fn();
    initContactForm(document, open);
    return { form: document.getElementById('contactForm'), open };
  };

  it('builds a mailto link with the visitor’s message', () => {
    const url = mailtoUrl({ name: 'Amina', email: 'a@example.com', message: 'Hello there' });
    expect(url.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(url)).toContain('Website enquiry from Amina');
    expect(decodeURIComponent(url)).toContain('Hello there');
  });

  it('opens the email app and says so when the form is valid', () => {
    const { form, open } = setup();
    form.elements.name.value = 'Amina'; form.elements.email.value = 'a@example.com'; form.elements.message.value = 'Hi';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(open).toHaveBeenCalledOnce();
    expect(document.getElementById('contactStatus').textContent).toContain(CONTACT_EMAIL);
  });

  it('does nothing when the form is incomplete', () => {
    const { form, open } = setup();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(open).not.toHaveBeenCalled();
    expect(document.getElementById('contactStatus').textContent).toBe('');
  });
});
