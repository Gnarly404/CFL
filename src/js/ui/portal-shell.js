import { ROUTES } from '@/core/routes.js';
import { h } from './h.js';

const ITEMS = [
  { key: 'dashboard', label: 'Dashboard', short: 'Home', href: ROUTES.student },
  { key: 'practice', label: 'English Practice', short: 'Practice', href: ROUTES.practice },
  { key: 'schedule', label: 'Schedule', short: 'Schedule' },
  { key: 'progress', label: 'Progress', short: 'Progress' },
  { key: 'messages', label: 'Messages', short: 'Messages' },
];

function item({ key, label, href }, active) {
  if (!href) return h('span', { 'aria-disabled': 'true' }, label, h('small', {}, 'Soon'));
  return h('a', { href, 'aria-current': key === active ? 'page' : null }, label);
}

/** Fills #portalSide and #portalBottom, which each portal page provides. */
export function mountPortalShell(active) {
  const side = document.getElementById('portalSide');
  const bottom = document.getElementById('portalBottom');
  side?.replaceChildren(
    h('div', { class: 'portal-brand' }, h('img', { src: '/images/logo.png', alt: '' }), h('span', {}, 'CFL')),
    h('nav', { class: 'portal-nav', 'aria-label': 'Student portal' }, ...ITEMS.map((entry) => item(entry, active))),
    h('div', { class: 'portal-spacer' }),
    h('nav', { class: 'portal-nav', 'aria-label': 'Account' }, h('a', { href: ROUTES.login, 'data-action': 'sign-out' }, 'Sign out')),
  );
  bottom?.replaceChildren(
    ...ITEMS.filter((entry) => ['dashboard', 'practice'].includes(entry.key)).map((entry) => {
      const link = h('a', { href: entry.href, 'aria-current': entry.key === active ? 'page' : null }, entry.short);
      return link;
    }),
    h('span', { 'aria-disabled': 'true' }, 'Progress'),
    h('a', { href: ROUTES.login, 'data-action': 'sign-out' }, 'Sign out'),
  );
}
