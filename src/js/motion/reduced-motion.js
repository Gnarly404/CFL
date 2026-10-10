/** Single place that decides whether the motion layer runs (spec 23.6 and 25). */
const REDUCE = '(prefers-reduced-motion: reduce)';
const NARROW = '(max-width: 820px)';

const query = (q) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);

export const prefersReducedMotion = () => Boolean(query(REDUCE)?.matches);
export const isNarrow = () => Boolean(query(NARROW)?.matches);
export const finePointer = () => Boolean(query('(hover: hover) and (pointer: fine)')?.matches);

/** Motion needs IntersectionObserver; without it, or with reduced motion on, pages simply show their content. */
export const motionSupported = () => typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
export const motionAllowed = () => motionSupported() && !prefersReducedMotion();

/** Calls back when the person switches reduced motion on while the page is open. */
export function onReducedMotion(callback) {
  const list = query(REDUCE);
  if (!list?.addEventListener) return () => {};
  const handler = (event) => { if (event.matches) callback(); };
  list.addEventListener('change', handler);
  return () => list.removeEventListener('change', handler);
}
