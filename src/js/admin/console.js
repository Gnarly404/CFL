import { animate } from 'motion';
import { motionAllowed } from '@/motion/reduced-motion.js';
import { DUR, EASE } from '@/motion/tokens.js';
import { play, settle } from '@/motion/dom.js';

/**
 * Admin console workspaces. The page keeps every section's id (#applications, #programmes ...) so old links
 * and bookmarks still work; sections are grouped into three workspaces and only one is shown at a time.
 * The location hash is the single source of truth: a link only changes the hash, this reacts to it.
 */
export const WORKSPACES = Object.freeze({
  admissions: { title: 'Admissions', blurb: 'Decide on applications and answer personal-data requests.', sections: ['applications', 'privacy-requests'] },
  people: { title: 'People', blurb: 'Accounts, roles, and who teaches whom.', sections: ['accounts', 'create-account', 'teaching-assignments'] },
  academics: { title: 'Academics', blurb: 'The programme catalogue and its teaching staff.', sections: ['programmes', 'programme-staff'] },
  students: { title: 'Students', blurb: 'Every student\'s details and fees. Open a record to edit it.', sections: ['student-records'] },
  payments: { title: 'Payments', blurb: 'Record payments, import a bank or M-Pesa statement, and see who has paid.', sections: ['payments-ledger', 'payment-imports'] },
});
const FALLBACK = 'admissions';
const REST = 'translate3d(0, 0, 0)';

/** Which workspace a location hash belongs to (a workspace name, or the id of a section inside one). */
export function workspaceFor(id) {
  if (!id) return FALLBACK;
  if (Object.hasOwn(WORKSPACES, id)) return id;
  return Object.keys(WORKSPACES).find((name) => WORKSPACES[name].sections.includes(id)) ?? FALLBACK;
}

export function initConsole({ root = document, win = window } = {}) {
  const panels = new Map([...root.querySelectorAll('[data-workspace]')].map((node) => [node.dataset.workspace, node]));
  if (!panels.size) return null;
  const links = [...root.querySelectorAll('[data-workspace-link]')];
  const title = root.querySelector('#consoleTitle');
  const blurb = root.querySelector('#consoleBlurb');
  let current = '';
  let ticket = 0;

  const hashId = () => { try { return decodeURIComponent(win.location.hash.slice(1)); } catch { return ''; } };

  async function show(name, { sectionId = '', initial = false } = {}) {
    const mine = ++ticket;
    const next = panels.get(name);
    if (current !== name && next) {
      const previous = panels.get(current);
      if (previous && !initial && motionAllowed()) {
        await play(() => animate(previous, { opacity: [1, 0] }, { duration: DUR.micro, ease: EASE.out }));
        settle(previous);
      }
      if (mine !== ticket) return; // a newer choice arrived while this one was leaving
      panels.forEach((node, key) => { node.hidden = key !== name; });
      current = name;
      links.forEach((link) => {
        if (link.dataset.workspaceLink === name) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      const info = WORKSPACES[name];
      if (title) title.textContent = info.title;
      if (blurb) blurb.textContent = info.blurb;
      if ('title' in root) root.title = `${info.title} · Admin console · Centre of Foreign Learning`;
      if (!initial && !sectionId) win.scrollTo?.({ top: 0, behavior: 'auto' });
      if (!initial && motionAllowed()) {
        play(() => animate(next, { opacity: [0, 1], transform: ['translate3d(0, 12px, 0)', REST] }, { duration: DUR.swap, ease: EASE.out })).then(() => settle(next));
      }
    }
    if (sectionId) root.getElementById?.(sectionId)?.scrollIntoView?.({ block: 'start', behavior: motionAllowed() ? 'smooth' : 'auto' });
  }

  const route = (initial) => {
    const id = hashId();
    const name = workspaceFor(id);
    return show(name, { sectionId: id && id !== name ? id : '', initial });
  };
  win.addEventListener('hashchange', () => route(false));
  route(true);

  return { show, get current() { return current; } };
}
