import { animate, stagger } from 'motion';
import { EASE } from './tokens.js';
import { gate } from './gate.js';

/**
 * Headline reveal: words rise out of a mask. The one orchestrated moment on a public page, used on
 * hero headlines only (data-split). The real text stays in the document for assistive technology;
 * the animated copy is aria-hidden.
 */
const seen = new WeakSet();

export function scanSplit(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('[data-split]').forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    if (!text) return;
    const real = document.createElement('span');
    real.className = 'visually-hidden';
    real.textContent = text;
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    const inner = text.split(' ').map((word, index, all) => {
      const outer = document.createElement('span');
      outer.className = 'split-word';
      const piece = document.createElement('span');
      piece.textContent = word;
      piece.style.transform = 'translate3d(0, 112%, 0)';
      outer.append(piece);
      visual.append(outer, index < all.length - 1 ? document.createTextNode(' ') : '');
      return piece;
    });
    el.replaceChildren(real, visual);
    const base = Number.parseFloat(el.dataset.revealDelay) || 0.1;
    gate.then(() => Promise.resolve(animate(inner, { transform: ['translate3d(0, 112%, 0)', 'translate3d(0, 0, 0)'] }, {
      duration: 0.9, ease: EASE.out, delay: stagger(0.07, { startDelay: base }),
    })).catch(() => {}).then(() => inner.forEach((piece) => piece.style.removeProperty('transform'))));
  });
}
