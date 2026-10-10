// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { transitionTarget } from '@/motion/transition.js';
import { skillCard, skillState } from '@/ui/skill-card.js';
import { icon, iconNames } from '@/ui/icons.js';

const here = { href: 'https://cfl.example/student/dashboard', origin: 'https://cfl.example', pathname: '/student/dashboard', search: '' };
const link = (href, attrs = {}) => { const a = document.createElement('a'); a.setAttribute('href', href); Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v)); return a; };
const click = (extra = {}) => ({ button: 0, defaultPrevented: false, ...extra });

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.documentElement.removeAttribute('data-motion'); document.documentElement.removeAttribute('data-veil'); });

describe('which clicks become page transitions', () => {
  it('animates ordinary same-site page links', () => {
    expect(transitionTarget(click(), link('/student/practice'), here)).toBe('https://cfl.example/student/practice');
    expect(transitionTarget(click(), link('/programmes?level=a1'), here)).toBe('https://cfl.example/programmes?level=a1');
  });

  it('leaves everything else to the browser', () => {
    const cases = [
      [click({ metaKey: true }), link('/x')], [click({ ctrlKey: true }), link('/x')], [click({ shiftKey: true }), link('/x')],
      [click({ button: 1 }), link('/x')], [click({ defaultPrevented: true }), link('/x')],
      [click(), link('/x', { target: '_blank' })], [click(), link('/x', { download: '' })],
      [click(), link('/x', { 'data-no-transition': '' })], [click(), link('/login', { 'data-action': 'sign-out' })],
      [click(), link('https://elsewhere.example/')], [click(), link('mailto:hi@cfl.example')],
      [click(), link('#contacts')], [click(), link('/student/dashboard#top')], [click(), link('/images/brochure.pdf')],
    ];
    for (const [event, a] of cases) expect(transitionTarget(event, a, here), a.outerHTML).toBeNull();
  });
});

describe('motion engine start-up', () => {
  const start = async () => { const { initMotion } = await import('@/motion/index.js'); initMotion(); };

  it('shows pages as they are, and never leaves the cover up, when reduced motion is requested', async () => {
    vi.stubGlobal('IntersectionObserver', class {});
    vi.stubGlobal('matchMedia', (q) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    document.documentElement.setAttribute('data-veil', 'on');
    await start();
    expect(document.documentElement.dataset.motion).toBe('off');
    expect(document.documentElement.hasAttribute('data-veil')).toBe(false);
  });

  it('turns itself off when the browser cannot observe visibility', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    document.documentElement.setAttribute('data-veil', 'on');
    await start();
    expect(document.documentElement.dataset.motion).toBe('off');
    expect(document.documentElement.hasAttribute('data-veil')).toBe(false);
  });
});

describe('skill cards', () => {
  const skill = { id: 'listening', label: 'Listening', blurb: 'Understand what you hear.' };
  const entry = (done, total = 3) => ({ skill, lessons: Array.from({ length: total }), done, percent: Math.round((done / total) * 100) });

  it('derives state from real progress', () => {
    expect(skillState(undefined)).toBe('soon');
    expect(skillState(entry(0))).toBe('new');
    expect(skillState(entry(1))).toBe('started');
    expect(skillState(entry(3))).toBe('done');
  });

  it('renders icon, outcome, progress and a clear action', () => {
    const card = skillCard(skill, entry(1), { href: '#x', detail: true });
    expect(card.tagName).toBe('A');
    expect(card.querySelector('.skill-icon svg')).not.toBeNull();
    expect(card.textContent).toContain('Understand what you hear.');
    expect(card.textContent).toContain('33% complete · 1 of 3 lessons');
    expect(card.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('33');
    expect(card.querySelector('.skill-cta').textContent).toBe('Continue');
  });

  it('shows an unavailable skill as inert and says so', () => {
    const card = skillCard({ id: 'listening', label: 'Listening' }, undefined, { href: '#x' });
    expect(card.tagName).toBe('DIV');
    expect(card.getAttribute('aria-disabled')).toBe('true');
    expect(card.textContent).toContain('Coming soon');
  });
});

describe('icons', () => {
  it('builds every icon as decorative SVG, and a labelled one on request', () => {
    for (const name of iconNames) expect(icon(name).getAttribute('aria-hidden')).toBe('true');
    expect(icon('speaker', { label: 'Speaker' }).getAttribute('role')).toBe('img');
    expect(() => icon('nope')).toThrow(/Unknown icon/);
  });
});
