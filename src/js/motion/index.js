import { motionAllowed, onReducedMotion } from './reduced-motion.js';
import { openGate } from './gate.js';
import { scanReveal } from './reveal.js';
import { scanProgress } from './progress.js';
import { scanParallax } from './parallax.js';
import { scanSplit } from './split-text.js';
import { scanTilt } from './tilt.js';
import { scanNavGlide } from './nav-glide.js';
import { initTransitions } from './transition.js';

/** Turns every motion feature off and makes sure nothing stays hidden. */
function stop(root = document.documentElement) {
  root.dataset.motion = 'off';
  root.removeAttribute('data-veil');
  openGate();
}

function scan(node) {
  scanSplit(node);
  scanReveal(node);
  scanProgress(node);
  scanParallax(node);
  scanTilt(node);
  scanNavGlide();
}

/** Starts the motion layer. Safe to call on any page; does nothing visible when motion is unavailable. */
export function initMotion() {
  const root = document.documentElement;
  if (!motionAllowed()) { stop(root); return; }
  try {
    root.dataset.motion = 'on';
    scan(document.body);
    // Content built by the page scripts (cards, lessons, nav) is picked up as it is added.
    new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach((node) => { if (node.nodeType === 1) scan(node); });
    }).observe(document.body, { childList: true, subtree: true });
    onReducedMotion(() => stop(root));
    initTransitions().catch((error) => { console.warn('Page transitions unavailable', error); stop(root); });
  } catch (error) {
    console.warn('Motion unavailable', error);
    stop(root);
  }
}
