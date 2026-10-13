import { animate } from 'motion';
import { SPRING } from './tokens.js';
import { pick } from './dom.js';

/**
 * One highlight that slides to whichever item is current, the way the portal navigation does (the
 * same idea as a shared layout animation). Markup opts in:
 *   data-glide            the container (data-glide="hover" also follows the pointer and keyboard focus)
 *   data-glide-item       each item the highlight can sit behind
 * "Current" is aria-current="page", aria-selected="true", aria-pressed="true" or .is-active, so the
 * script that changes the page state never has to know about the animation.
 * Colour and shape come from --glide-bg and --glide-radius.
 */
const ACTIVE = '[aria-current="page"], [aria-selected="true"], [aria-pressed="true"], .is-active';
const seen = new WeakSet();

const itemsOf = (root) => [...root.querySelectorAll('[data-glide-item]')].filter((node) => !node.hidden && node.getAttribute('aria-disabled') !== 'true');
const box = (node) => ({ x: node.offsetLeft, y: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight });

function bind(root) {
  const pill = document.createElement('span');
  pill.className = 'glide-pill';
  pill.setAttribute('aria-hidden', 'true');
  pill.hidden = true;
  root.prepend(pill);

  let placed = false;
  const setHidden = (value) => { if (pill.hidden !== value) pill.hidden = value; };
  const move = (target, { instant = false } = {}) => {
    if (!target?.offsetWidth) { setHidden(true); placed = false; return; }
    setHidden(false);
    animate(pill, box(target), placed && !instant ? SPRING.glide : { duration: 0 });
    placed = true;
  };
  const home = () => itemsOf(root).find((node) => node.matches(ACTIVE));
  const settleHome = (options) => move(home(), options);

  new MutationObserver((records) => {
    if (records.some((record) => record.target !== pill)) settleHome();
  }).observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'aria-selected', 'aria-pressed', 'class', 'hidden'] });

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => settleHome({ instant: true })).observe(root);
  document.fonts?.ready?.then(() => settleHome({ instant: true })).catch(() => {});
  requestAnimationFrame(() => settleHome({ instant: true }));

  if (root.dataset.glide === 'hover') {
    itemsOf(root).forEach((node) => {
      node.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') move(node); });
      node.addEventListener('focus', () => move(node));
      node.addEventListener('blur', () => settleHome());
    });
    root.addEventListener('pointerleave', () => settleHome());
  }
}

export function scanGlide(root) {
  pick(root, '[data-glide]').forEach((node) => {
    if (seen.has(node)) return;
    seen.add(node);
    bind(node);
  });
}
