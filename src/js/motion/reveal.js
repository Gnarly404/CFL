import { animate, inView, stagger } from 'motion';
import { DUR, EASE, STAGGER, TRAVEL } from './tokens.js';
import { gate } from './gate.js';

/**
 * Reveal system (spec 23.5). Markup opts in; nothing is animated by default.
 *   data-reveal[="fade"]   one element rises (or fades) in once when scrolled into view
 *   data-reveal-delay="s"  extra delay in seconds
 *   data-reveal-group      the direct children enter with a small stagger, including children
 *                          added later by script (skill cards, lesson rows, programme cards)
 *   data-reveal-swap       children are replaced as the person moves on (lesson steps): the new
 *                          content arrives with a short rise
 * CSS keeps opted-in elements hidden until they have run, and shows everything if scripting or
 * motion is unavailable.
 */
const END = 'translate3d(0, 0, 0)';
const seen = new WeakSet();

const unrevealed = (el) => !el.hasAttribute('data-revealed');
const settle = (el) => { el.style.removeProperty('opacity'); el.style.removeProperty('transform'); };

/** Animates the given elements in, staggered. Resolves when they are at rest. Never leaves one hidden. */
export function revealElements(elements, { delay = 0, step = STAGGER, kind = 'rise', duration = DUR.reveal, distance = TRAVEL } = {}) {
  const list = [...elements].filter(unrevealed);
  if (!list.length) return Promise.resolve();
  const from = `translate3d(0, ${distance}px, 0)`;
  for (const el of list) {
    el.style.opacity = '0';
    if (kind !== 'fade') el.style.transform = from;
    el.setAttribute('data-revealed', '');
  }
  try {
    const keyframes = kind === 'fade' ? { opacity: [0, 1] } : { opacity: [0, 1], transform: [from, END] };
    return Promise.resolve(animate(list, keyframes, { duration, ease: EASE.out, delay: stagger(step, { startDelay: delay }) }))
      .catch(() => {})
      .then(() => list.forEach(settle));
  } catch {
    list.forEach(settle);
    return Promise.resolve();
  }
}

const byDocumentOrder = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

/** Elements that enter in the same frame cascade top to bottom instead of popping together. */
let batch = [];
let scheduled = false;
function enqueue(el) {
  batch.push(el);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    const items = batch.sort(byDocumentOrder);
    batch = [];
    scheduled = false;
    gate.then(() => items.forEach((item, index) => {
      const own = Number.parseFloat(item.dataset.revealDelay) || 0;
      revealElements([item], { delay: own + index * STAGGER, kind: item.dataset.reveal === 'fade' ? 'fade' : 'rise' });
    }));
  });
}

function watchSingle(el) {
  inView(el, () => { enqueue(el); }, { amount: 0.15, margin: '0px 0px -6% 0px' });
}

function watchGroup(container) {
  let live = false;
  let pending = false;
  const flush = () => {
    pending = false;
    const kids = [...container.children].filter(unrevealed);
    if (kids.length) gate.then(() => revealElements(kids, { delay: Number.parseFloat(container.dataset.revealDelay) || 0 }));
  };
  inView(container, () => { live = true; flush(); }, { amount: 0.1, margin: '0px 0px -6% 0px' });
  new MutationObserver(() => {
    if (live && !pending) { pending = true; queueMicrotask(flush); }
  }).observe(container, { childList: true });
}

function watchSwap(container) {
  new MutationObserver(() => {
    const kids = [...container.children].filter(unrevealed);
    // Prime synchronously (this runs before paint) so replaced content never flashes at full opacity.
    if (kids.length) revealElements(kids, { duration: DUR.swap, step: 0.04, distance: 14 });
  }).observe(container, { childList: true });
}

/** Finds opted-in elements in `root` (idempotent). */
export function scanReveal(root) {
  if (!root?.querySelectorAll) return;
  const pick = (selector) => [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)].filter((el) => !seen.has(el) && seen.add(el));
  pick('[data-reveal]').forEach(watchSingle);
  pick('[data-reveal-group]').forEach(watchGroup);
  pick('[data-reveal-swap]').forEach(watchSwap);
}
