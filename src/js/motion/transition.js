import { animate, stagger } from 'motion';
import { DUR, EASE } from './tokens.js';
import { openGate } from './gate.js';

/**
 * Page transitions for a multi-page site. Leaving a page, five curved panels sweep up over it
 * (sky, coral, sun, navy, then ink carrying the CFL mark). The next page already starts covered
 * (<html data-veil>, see css/motion.css), so there is never a flash between pages; once it is
 * ready the panels lift away in reverse and the page's reveals begin underneath them.
 * Links stay ordinary links: modified clicks, new tabs, downloads, files, other sites and
 * controls with data-action are left alone, and any failure just navigates normally.
 */
const TONES = ['sky', 'coral', 'sun', 'navy', 'ink'];
const OFF = 'translate3d(0, 120vh, 0)';
const ON = 'translate3d(0, 0, 0)';
const AWAY = 'translate3d(0, -120vh, 0)';
const LIFT_REVEAL_DELAY = 280; // ms: reveals start as the first strip of page shows

let veil = null;
let leaving = false;

function build() {
  if (veil) return veil;
  const root = document.createElement('div');
  root.className = 'cfl-veil';
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  const panels = TONES.map((tone) => {
    const panel = document.createElement('div');
    panel.className = 'cfl-veil__panel';
    panel.dataset.tone = tone;
    panel.style.transform = OFF;
    return panel;
  });
  const mark = document.createElement('div');
  mark.className = 'cfl-veil__mark';
  const word = document.createElement('span');
  word.className = 'cfl-veil__word';
  word.textContent = 'CFL';
  const wave = document.createElement('span');
  wave.className = 'wave';
  wave.setAttribute('data-live', '');
  for (let i = 0; i < 5; i += 1) wave.append(document.createElement('i'));
  mark.append(word, wave);
  panels[panels.length - 1].append(mark);
  root.append(...panels);
  document.body.append(root);
  veil = { root, panels, mark };
  return veil;
}

const settled = (controls) => Promise.resolve(controls).catch(() => {});

function cover() {
  const v = build();
  v.root.hidden = false;
  v.root.setAttribute('data-active', '');
  v.panels.forEach((panel) => { panel.style.transform = OFF; });
  v.mark.style.opacity = '0';
  animate(v.mark, { opacity: [0, 1], transform: ['translate3d(0, 14px, 0)', 'translate3d(0, 0, 0)'] }, { duration: 0.35, ease: EASE.out, delay: 0.38 });
  return settled(animate(v.panels, { transform: [OFF, ON] }, { duration: DUR.veilIn, ease: EASE.inOut, delay: stagger(0.045) }));
}

async function lift() {
  const v = build();
  v.root.hidden = false;
  v.panels.forEach((panel) => { panel.style.transform = ON; });
  v.mark.style.opacity = '1';
  setTimeout(openGate, LIFT_REVEAL_DELAY);
  animate(v.mark, { opacity: [1, 0] }, { duration: 0.22, ease: 'easeOut' });
  await settled(animate([...v.panels].reverse(), { transform: [ON, AWAY] }, { duration: DUR.veilOut, ease: EASE.inOut, delay: stagger(0.05) }));
  v.root.hidden = true;
  v.root.removeAttribute('data-active');
  v.panels.forEach((panel) => { panel.style.transform = OFF; });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Ready = markup parsed, fonts settled (briefly), and, on protected pages, the role check passed. */
async function pageReady() {
  if (document.readyState === 'loading') {
    await Promise.race([new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true })), wait(2500)]);
  }
  await Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(600)]);
  const root = document.documentElement;
  if (root.hasAttribute('data-auth')) {
    await Promise.race([
      new Promise((resolve) => {
        const watcher = new MutationObserver(() => { if (!root.hasAttribute('data-auth')) { watcher.disconnect(); resolve(); } });
        watcher.observe(root, { attributes: true, attributeFilter: ['data-auth'] });
      }),
      wait(3500),
    ]);
  }
  await frame();
  await frame();
}

/** Decides whether a click should become an animated page change. Exported for tests. */
export function transitionTarget(event, link, here = window.location) {
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if ((link.target && link.target !== '_self') || link.hasAttribute('download') || link.hasAttribute('data-no-transition') || link.dataset.action) return null;
  let url;
  try { url = new URL(link.getAttribute('href') ?? '', here.href); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null; // same page or in-page anchor
  if (/\.[a-z0-9]+$/i.test(url.pathname) && !/\.html?$/i.test(url.pathname)) return null; // files such as the brochure PDF
  return url.href;
}

async function go(href) {
  if (leaving) return;
  leaving = true;
  const fallback = setTimeout(() => window.location.assign(href), 1400);
  try { await cover(); } catch { /* navigate regardless */ }
  clearTimeout(fallback);
  window.location.assign(href);
}

const prefetched = new Set();
function prefetch(href) {
  if (prefetched.has(href)) return;
  prefetched.add(href);
  const tag = document.createElement('link');
  tag.rel = 'prefetch';
  tag.href = href;
  document.head.append(tag);
}

export async function initTransitions() {
  const root = document.documentElement;

  // Script-driven page changes (after sign-in or sign-out) use the same exit animation when it is running.
  window.cflNavigate = (href) => go(new URL(href, window.location.href).href);

  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const href = transitionTarget(event, link);
    if (!href) return;
    event.preventDefault();
    go(href);
  });
  const intent = (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const href = link && transitionTarget({ button: 0 }, link);
    if (href) prefetch(href);
  };
  document.addEventListener('pointerover', intent, { passive: true });
  document.addEventListener('touchstart', intent, { passive: true });

  // Coming back through the back/forward cache restores the page as it was left: covered.
  addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    leaving = false;
    openGate();
    if (veil) { veil.root.hidden = true; veil.root.removeAttribute('data-active'); }
    root.removeAttribute('data-veil');
  });

  if (!root.hasAttribute('data-veil')) { openGate(); return; }
  const v = build();
  v.root.hidden = false;
  v.panels.forEach((panel) => { panel.style.transform = ON; });
  v.mark.style.opacity = '1';
  root.removeAttribute('data-veil'); // the animated panels now hold the cover
  await pageReady();
  await lift();
}
