import { ROUTES } from '@/core/routes.js';
import { h } from './h.js';
import { attentionBadge } from './attention-badge.js';

const ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: ROUTES.instructor },
  { key: 'review', label: 'Writing review', href: ROUTES.instructorReview, attention: 'writing-review' },
  { key: 'messages', label: 'Messages', href: ROUTES.instructorMessages },
];
const CURRICULUM = { key: 'curriculum', label: 'Curriculum', href: ROUTES.instructorCurriculum };

/** Fills #portalSide and #portalBottom for instructor pages. */
export function mountInstructorShell(active, role) {
  const items = role === 'instructor' ? [ITEMS[0], CURRICULUM, ...ITEMS.slice(1)] : ITEMS;
  const link = (entry) => h('a', { href: entry.href, 'aria-current': entry.key === active ? 'page' : null }, entry.label, entry.attention ? attentionBadge(entry.attention) : '');
  document.getElementById('portalSide')?.replaceChildren(
    h('div', { class: 'portal-brand' }, h('img', { src: '/images/logo.png', alt: '' }), h('span', {}, 'CFL Staff')),
    h('nav', { class: 'portal-nav', 'aria-label': 'Instructor' }, ...items.map(link)),
    h('div', { class: 'portal-spacer' }),
    h('nav', { class: 'portal-nav portal-account', 'aria-label': 'Account' },
      h('span', { class: 'portal-user-name', 'data-user-name': true }),
      h('a', { href: ROUTES.login, 'data-action': 'sign-out' }, 'Sign out')),
  );
  document.getElementById('portalBottom')?.replaceChildren(
    ...items.map(link),
    h('a', { href: ROUTES.login, 'data-action': 'sign-out' },
      h('span', { class: 'portal-user-name', 'data-user-name': true }), h('span', {}, 'Sign out')),
  );
}
