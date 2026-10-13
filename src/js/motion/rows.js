import { animate, stagger } from 'motion';
import { DUR, EASE } from './tokens.js';
import { pick, play, settle } from './dom.js';

/**
 * Table bodies that scripts refill (admin console lists). Markup: <tbody data-rows>.
 * New rows rise a few pixels with a short cascade; only the first rows move, so a long list never
 * keeps the person waiting. Loading and empty-state rows stay still.
 */
const seen = new WeakSet();
const LIMIT = 14;
const REST = 'translate3d(0, 0, 0)';

function bind(body) {
  new MutationObserver(() => {
    const fresh = [...body.children].filter((row) => !row.hasAttribute('data-in'));
    fresh.forEach((row) => row.setAttribute('data-in', ''));
    const moving = fresh.filter((row) => !row.querySelector('td.empty')).slice(0, LIMIT);
    if (!moving.length) return;
    moving.forEach((row) => { row.style.opacity = '0'; });
    play(() => animate(moving, { opacity: [0, 1], transform: ['translate3d(0, 8px, 0)', REST] }, { duration: DUR.swap, ease: EASE.out, delay: stagger(0.03) }))
      .then(() => settle(moving));
  }).observe(body, { childList: true });
}

export function scanRows(root) {
  pick(root, '[data-rows]').forEach((body) => {
    if (seen.has(body)) return;
    seen.add(body);
    bind(body);
  });
}
