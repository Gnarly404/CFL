import { animate } from 'motion';
import { motionAllowed } from '@/motion/reduced-motion.js';
import { EASE } from '@/motion/tokens.js';

const shown = new WeakMap();

/**
 * Updates the "at a glance" numbers: <dd data-stat="openApplications">. The number counts from its
 * previous value to the new one; with reduced motion it simply changes.
 */
export function setStat(key, value, root = document) {
  const count = Math.max(0, Math.trunc(Number(value)) || 0);
  root.querySelectorAll(`[data-stat="${key}"]`).forEach((node) => {
    const from = shown.get(node) ?? 0;
    shown.set(node, count);
    node.dataset.value = String(count);
    if (!motionAllowed() || from === count) { node.textContent = String(count); return; }
    try {
      animate(from, count, {
        duration: 0.8,
        ease: EASE.out,
        onUpdate: (current) => { node.textContent = String(Math.round(current)); },
        onComplete: () => { node.textContent = String(count); },
      });
    } catch {
      node.textContent = String(count);
    }
  });
}
