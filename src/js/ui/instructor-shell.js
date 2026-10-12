import { ROUTES } from '@/core/routes.js';
import { h } from './h.js';
import { icon } from './icons.js';
import { attentionBadge } from './attention-badge.js';

const ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: ROUTES.instructor, icon: 'dashboard' },
  { key: 'review', label: 'Writing review', href: ROUTES.instructorReview, attention: 'writing-review', icon: 'review' },
  { key: 'messages', label: 'Messages', href: ROUTES.instructorMessages, icon: 'messages' },
];
const CURRICULUM = { key: 'curriculum', label: 'Curriculum', href: ROUTES.instructorCurriculum, icon: 'curriculum' };

/** Fills #portalSide and #portalBottom for instructor pages. */
export function mountInstructorShell(active, role) {
  const items = role === 'instructor' ? [ITEMS[0], CURRICULUM, ...ITEMS.slice(1)] : ITEMS;
  const link = (entry, mobile = false) => h('a', {
    href: entry.href,
    class: 'portal-shell-link',
    'aria-current': entry.key === active ? 'page' : null,
  }, icon(entry.icon, { size: mobile ? 18 : 20 }), h('span', { class: mobile ? 'portal-bottom-label' : 'portal-nav-label' }, entry.label), entry.attention ? attentionBadge(entry.attention) : '');
  document.getElementById('portalSide')?.replaceChildren(
    h('div', { class: 'portal-brand' }, h('img', { src: '/images/logo.png', alt: '' }), h('span', {}, 'CFL Staff')),
    h('nav', { class: 'portal-nav', 'aria-label': 'Instructor' }, ...items.map(link)),
    h('div', { class: 'portal-spacer' }),
    h('nav', { class: 'portal-nav portal-account', 'aria-label': 'Account' },
      h('span', { class: 'portal-user-name', 'data-user-name': true }),
      h('a', { href: ROUTES.login, class: 'portal-sign-out', 'data-action': 'sign-out' }, icon('logout', { size: 19 }), h('span', { class: 'portal-nav-label' }, 'Sign out'))),
  );
  document.getElementById('portalBottom')?.replaceChildren(
    ...items.map((entry) => link(entry, true)),
    h('a', { href: ROUTES.login, class: 'portal-sign-out', 'data-action': 'sign-out' },
      icon('logout', { size: 18 }), h('span', { class: 'portal-user-name', 'data-user-name': true }), h('span', { class: 'portal-bottom-label' }, 'Sign out')),
  );
}
