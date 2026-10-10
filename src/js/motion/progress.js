import { animate, inView } from 'motion';
import { DUR, EASE } from './tokens.js';
import { gate } from './gate.js';

/**
 * Meaningful progress motion (spec 23.3): bars fill from the left when they come into view, and
 * numbers marked data-count rise to their value. The markup always holds the true value, so the
 * page is correct without this.
 */
const seen = new WeakSet();

function fillBar(bar, span) {
  span.setAttribute('data-filled', '');
  span.style.transform = 'scaleX(0)';
  gate.then(() => Promise.resolve(animate(span, { transform: ['scaleX(0)', 'scaleX(1)'] }, { duration: DUR.progress, ease: EASE.out, delay: 0.12 }))
    .catch(() => {})
    .then(() => span.style.removeProperty('transform')));
}

function countUp(el) {
  const target = Number.parseFloat(el.dataset.count);
  if (!Number.isFinite(target)) return;
  const suffix = el.dataset.suffix ?? '';
  el.textContent = `0${suffix}`;
  gate.then(() => {
    animate(0, target, {
      duration: 1.6,
      ease: EASE.out,
      onUpdate: (value) => { el.textContent = `${Math.round(value).toLocaleString('en')}${suffix}`; },
      onComplete: () => { el.textContent = `${Math.round(target).toLocaleString('en')}${suffix}`; },
    });
  });
}

export function scanProgress(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('.progress > span').forEach((span) => {
    if (seen.has(span)) return;
    seen.add(span);
    const bar = span.parentElement;
    inView(bar, () => { fillBar(bar, span); }, { amount: 0.6 });
  });
  root.querySelectorAll('[data-count]').forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    inView(el, () => { countUp(el); }, { amount: 0.6 });
  });
}
