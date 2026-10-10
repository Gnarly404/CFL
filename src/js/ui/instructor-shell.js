import { ROUTES } from '@/core/routes.js';
import { h } from './h.js';

const ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: ROUTES.instructor },
  { key: 'review', label: 'Writing review', href: ROUTES.instructorReview },
];

/** Fills #portalSide and #portalBottom for instructor pages. */
export function mountInstructorShell(active) {
  const link = (entry) => h('a', { href: entry.href, 'aria-current': entry.key === active ? 'page' : null }, entry.label);
  document.getElementById('portalSide')?.replaceChildren(
    h('div', { class: 'portal-brand' }, h('img', { src: '/images/logo.png', alt: '' }), h('span', {}, 'CFL Staff')),
    h('nav', { class: 'portal-nav', 'aria-label': 'Instructor' }, ...ITEMS.map(link)),
    h('div', { class: 'portal-spacer' }),
    h('nav', { class: 'portal-nav', 'aria-label': 'Account' }, h('a', { href: ROUTES.login, 'data-action': 'sign-out' }, 'Sign out')),
  );
  document.getElementById('portalBottom')?.replaceChildren(
    ...ITEMS.map(link),
    h('a', { href: ROUTES.login, 'data-action': 'sign-out' }, 'Sign out'),
  );
}
