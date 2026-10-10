import { scroll } from 'motion';
import { isNarrow } from './reduced-motion.js';

/**
 * Parallax (spec 23.4). Background layers only; text and controls never move. Driven by Motion's
 * scroll tracking, which runs on the shared animation frame instead of a raw scroll listener.
 *
 *   <section class="parallax-scope"><div class="parallax-layer" data-parallax="0.6"></div>...</section>
 *
 * data-parallax is how much of the layer's spare height (14% each side) to use, 0 to 1.
 * data-parallax-mode="exit" is for a hero at the top of the page: the layer drifts as it scrolls away.
 * Amplitude is halved on narrow screens.
 */
const SLACK = 0.14;
const seen = new WeakSet();

function bind(layer) {
  const scope = layer.closest('.parallax-scope') ?? layer.parentElement;
  if (!scope) return;
  const strength = Math.min(1, Math.max(0, Number.parseFloat(layer.dataset.parallax) || 0.6));
  const exit = layer.dataset.parallaxMode === 'exit';
  scroll((progress) => {
    const range = scope.offsetHeight * SLACK * strength * (isNarrow() ? 0.5 : 1);
    const y = exit ? progress * range : (progress - 0.5) * 2 * range;
    layer.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
  }, { target: scope, offset: exit ? ['start start', 'end start'] : ['start end', 'end start'] });
}

export function scanParallax(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('[data-parallax]').forEach((layer) => {
    if (seen.has(layer)) return;
    seen.add(layer);
    try { bind(layer); } catch (error) { console.warn('Parallax unavailable', error); }
  });
}
