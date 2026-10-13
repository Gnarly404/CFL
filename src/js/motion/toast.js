import { animate } from 'motion';
import { DUR, EASE } from './tokens.js';
import { pick, play, settle } from './dom.js';

/**
 * Status messages that appear over the page instead of pushing it around. Markup: <p data-toast hidden>.
 * Scripts keep using showMessage(): they set the text, the kind and `hidden`, and this watches them.
 * Success and info messages leave on their own; errors stay until dismissed (click or Escape).
 */
const seen = new WeakSet();
const REST = 'translate3d(0, 0, 0)';
const LINGER_MS = 7000;

function bind(node) {
  let timer = 0;
  const stopTimer = () => { clearTimeout(timer); timer = 0; };

  async function dismiss() {
    stopTimer();
    if (node.hidden) return;
    await play(() => animate(node, { opacity: [1, 0], transform: [REST, 'translate3d(0, 8px, 0)'] }, { duration: DUR.micro, ease: EASE.out }));
    node.hidden = true;
    settle(node);
  }

  new MutationObserver(() => {
    stopTimer();
    if (node.hidden) return;
    play(() => animate(node, { opacity: [0, 1], transform: ['translate3d(0, 12px, 0)', REST] }, { duration: DUR.swap, ease: EASE.out })).then(() => settle(node));
    if (node.dataset.kind !== 'error') timer = setTimeout(dismiss, LINGER_MS);
  }).observe(node, { attributes: true, attributeFilter: ['hidden', 'data-kind'], childList: true, characterData: true, subtree: true });

  node.addEventListener('click', dismiss);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') dismiss(); });
}

export function scanToast(root) {
  pick(root, '[data-toast]').forEach((node) => {
    if (seen.has(node)) return;
    seen.add(node);
    bind(node);
  });
}
