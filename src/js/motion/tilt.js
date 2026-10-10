import { finePointer } from './reduced-motion.js';

/**
 * Pointer tilt for one showpiece card (the gallery brochure preview). Replaces the page's own
 * event-heavy version: one animation frame loop that stops when the card has settled, mouse and
 * pen only, off for reduced motion (the engine is not started then).
 */
const seen = new WeakSet();
const MAX = 8; // degrees

function bind(card) {
  let rx = 0; let ry = 0; let tx = 0; let ty = 0; let frame = 0;
  const tick = () => {
    rx += (tx - rx) * 0.12;
    ry += (ty - ry) * 0.12;
    card.style.transform = `perspective(1000px) rotateX(${(-rx).toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    if (Math.abs(tx - rx) > 0.01 || Math.abs(ty - ry) > 0.01) frame = requestAnimationFrame(tick);
    else { frame = 0; if (!tx && !ty) card.style.removeProperty('transform'); }
  };
  const kick = () => { if (!frame) frame = requestAnimationFrame(tick); };
  card.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const box = card.getBoundingClientRect();
    tx = ((event.clientY - box.top) / box.height - 0.5) * 2 * MAX;
    ty = ((event.clientX - box.left) / box.width - 0.5) * 2 * MAX;
    kick();
  });
  card.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
}

export function scanTilt(root) {
  if (!finePointer() || !root?.querySelectorAll) return;
  root.querySelectorAll('[data-tilt]').forEach((card) => {
    if (seen.has(card)) return;
    seen.add(card);
    bind(card);
  });
}
