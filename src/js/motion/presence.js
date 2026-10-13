import { animate, stagger } from 'motion';
import { DUR, EASE, SPRING } from './tokens.js';
import { pick, play, settle } from './dom.js';

/**
 * Things that appear and disappear. Markup:
 *   data-enter           the element eases in whenever it stops being hidden (hidden attribute or .hidden class)
 *   [data-draw]          inside such an element, an SVG stroke (give it pathLength="1") draws itself
 *   [data-pop]           inside such an element, a badge springs in
 *   <details> in the admin console and curriculum editor: the content rises when the panel opens
 * Opening content is the slower move, leaving is not animated at all: it is the faster of the two.
 */
const seenEnter = new WeakSet();
const seenDetails = new WeakSet();
const REST = 'translate3d(0, 0, 0)';
const DETAILS = 'details.application-details, details.privacy-review-item, details.curriculum-item, details[data-animate]';

const isShown = (node) => !node.hidden && !node.classList.contains('hidden');

function celebrate(node) {
  node.querySelectorAll('[data-pop]').forEach((badge) => {
    play(() => animate(badge, { opacity: [0, 1], transform: ['scale(0.6)', 'scale(1)'] }, SPRING.pop)).then(() => settle(badge));
  });
  node.querySelectorAll('[data-draw]').forEach((stroke, index) => {
    play(() => animate(stroke, { strokeDashoffset: [1, 0] }, { duration: 0.6, delay: 0.18 + index * 0.1, ease: EASE.out }))
      .then(() => { stroke.style.strokeDashoffset = '0'; }); // the drawn state is final even if the animation could not play
  });
}

function bindEnter(node) {
  let was = isShown(node);
  new MutationObserver(() => {
    const now = isShown(node);
    if (now && !was) {
      play(() => animate(node, { opacity: [0, 1], transform: ['translate3d(0, 10px, 0)', REST] }, { duration: DUR.swap, ease: EASE.out })).then(() => settle(node));
      celebrate(node);
    }
    was = now;
  }).observe(node, { attributes: true, attributeFilter: ['hidden', 'class'] });
}

function bindDetails(details) {
  details.addEventListener('toggle', () => {
    if (!details.open) return;
    const body = [...details.children].filter((child) => child.tagName !== 'SUMMARY');
    if (!body.length) return;
    play(() => animate(body, { opacity: [0, 1], transform: ['translate3d(0, -6px, 0)', REST] }, { duration: DUR.swap, ease: EASE.out, delay: stagger(0.04) })).then(() => settle(body));
  });
}

export function scanPresence(root) {
  pick(root, '[data-enter]').forEach((node) => { if (!seenEnter.has(node)) { seenEnter.add(node); bindEnter(node); } });
  pick(root, DETAILS).forEach((node) => { if (!seenDetails.has(node)) { seenDetails.add(node); bindDetails(node); } });
}
