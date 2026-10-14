/** Single place that decides whether the motion layer runs (spec 23.6 and 25). */
const REDUCE = '(prefers-reduced-motion: reduce)';
const NARROW = '(max-width: 820px)';

const query = (q) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);

const KEY = 'cfl.reduceMotion';
const EVENT = 'cfl:reduce-motion';

/**
 * The student's own "Reduce motion" setting (Account settings). It is kept in this browser as well as on the
 * student record, so every page honours it from the first paint, not only the dashboard.
 */
export const userReducedMotion = () => {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.reduceMotion === 'true') return true;
  try { return window.localStorage.getItem(KEY) === 'true'; } catch { return false; }
};

/** Saves the choice, applies it to this page now, and tells the motion layer to stop (or allow) animation. */
export function setReduceMotionPreference(on) {
  const root = document.documentElement;
  if (on) root.dataset.reduceMotion = 'true';
  else delete root.dataset.reduceMotion;
  try {
    if (on) window.localStorage.setItem(KEY, 'true');
    else window.localStorage.removeItem(KEY);
  } catch { /* private mode: the setting still applies to this page */ }
  if (on) window.dispatchEvent(new Event(EVENT));
}

// Apply a remembered choice to the stylesheet rule before anything is painted.
if (typeof document !== 'undefined' && userReducedMotion()) document.documentElement.dataset.reduceMotion = 'true';

export const prefersReducedMotion = () => Boolean(query(REDUCE)?.matches) || userReducedMotion();
export const isNarrow = () => Boolean(query(NARROW)?.matches);
export const finePointer = () => Boolean(query('(hover: hover) and (pointer: fine)')?.matches);

/** Motion needs IntersectionObserver; without it, or with reduced motion on, pages simply show their content. */
export const motionSupported = () => typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
export const motionAllowed = () => motionSupported() && !prefersReducedMotion();

/** Calls back when the person switches reduced motion on while the page is open. */
export function onReducedMotion(callback) {
  const list = query(REDUCE);
  const handler = (event) => { if (event.matches) callback(); };
  list?.addEventListener?.('change', handler);
  const onUser = () => callback();
  if (typeof window !== 'undefined') window.addEventListener(EVENT, onUser);
  return () => {
    list?.removeEventListener?.('change', handler);
    if (typeof window !== 'undefined') window.removeEventListener(EVENT, onUser);
  };
}
