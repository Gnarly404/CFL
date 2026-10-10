import { animate } from 'motion';

/**
 * Portal navigation: a single highlight glides to the item you hover or focus and settles on the
 * current page. It also remembers where it was on the previous page, so moving between portal
 * pages reads as one continuous object travelling to its new place.
 */
const KEY = 'cfl:nav-pill';
const SPRING = { type: 'spring', stiffness: 420, damping: 36 };
const seen = new WeakSet();

const items = (nav) => [...nav.children].filter((node) => node.matches('a, span') && !node.classList.contains('nav-pill') && node.getAttribute('aria-disabled') !== 'true');

function rectIn(nav, node) {
  const a = nav.getBoundingClientRect();
  const b = node.getBoundingClientRect();
  return { x: Math.round(b.left - a.left), y: Math.round(b.top - a.top), w: Math.round(b.width), h: Math.round(b.height) };
}

const readPrev = (kind) => { try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); return v?.kind === kind ? v : null; } catch { return null; } };
const writePrev = (kind, r) => { try { sessionStorage.setItem(KEY, JSON.stringify({ kind, ...r })); } catch { /* storage unavailable */ } };

function setup(nav) {
  const active = nav.querySelector(':scope > [aria-current="page"]');
  if (!active) return;
  const kind = nav.classList.contains('portal-bottom') ? 'h' : 'v';
  const pill = document.createElement('span');
  pill.className = 'nav-pill';
  pill.setAttribute('aria-hidden', 'true');
  nav.prepend(pill);

  // Every move goes through Motion so it owns the transform; "put" is simply an instant move.
  const put = (r) => animate(pill, { x: r.x, y: r.y, width: r.w, height: r.h }, { duration: 0 });
  const to = (r) => animate(pill, { x: r.x, y: r.y, width: r.w, height: r.h }, SPRING);
  const home = () => rectIn(nav, active);

  const start = readPrev(kind);
  const end = home();
  if (start && (start.x !== end.x || start.y !== end.y)) { put(start); to(end); } else put(end);
  writePrev(kind, end);

  items(nav).forEach((node) => {
    node.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') to(rectIn(nav, node)); });
    node.addEventListener('focus', () => to(rectIn(nav, node)));
    node.addEventListener('blur', () => to(home()));
  });
  nav.addEventListener('pointerleave', () => to(home()));
  addEventListener('resize', () => put(home()), { passive: true });
}

/** Always looks at the whole document: the shell inserts the nav itself, or only fills in its links. */
export function scanNavGlide() {
  document.querySelectorAll('.portal-nav, .portal-bottom').forEach((nav) => {
    if (seen.has(nav)) return;
    // Wait until the shell has filled the navigation (it is built by script after load).
    if (!nav.querySelector(':scope > [aria-current="page"]')) return;
    seen.add(nav);
    requestAnimationFrame(() => setup(nav));
  });
}
