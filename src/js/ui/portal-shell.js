import { ROUTES } from '@/core/routes.js';
import { h } from './h.js';
import { icon } from './icons.js';

const ITEMS = [
  { key: 'dashboard', label: 'Dashboard', short: 'Home', href: ROUTES.student, icon: 'dashboard' },
  { key: 'practice', label: 'English Practice', short: 'Practice', href: ROUTES.practice, icon: 'reading' },
  { key: 'notifications', label: 'Notifications', short: 'Alerts', href: ROUTES.notifications, badge: true, icon: 'notifications' },
  { key: 'schedule', label: 'Schedule', short: 'Schedule', href: ROUTES.schedule, icon: 'schedule' },
  { key: 'progress', label: 'Progress', short: 'Progress', icon: 'progress' },
  { key: 'messages', label: 'Messages', short: 'Messages', href: ROUTES.messages, icon: 'messages' },
];

const badgeNode = () => h('span', { class: 'nav-attention', 'data-attention-key': 'notifications', 'data-notification-count': true, hidden: true }, h('span', { 'aria-hidden': 'true' }), h('span', { class: 'visually-hidden' }));
const settingsLink = () => h('a', {
  class: 'portal-settings-link', href: `${ROUTES.student}#settings`, 'aria-label': 'Account and privacy settings',
}, icon('settings', { size: 19 }), h('span', { class: 'portal-nav-label' }, 'Settings'));
const signOutLink = ({ mobile = false } = {}) => h('a', { href: ROUTES.login, class: 'portal-sign-out', 'data-action': 'sign-out' },
  icon('logout', { size: 19 }),
  ...(mobile ? [h('span', { class: 'portal-user-name', 'data-user-name': true })] : []),
  h('span', { class: mobile ? 'portal-bottom-label' : 'portal-nav-label' }, 'Sign out'));

function item({ key, label, short, href, badge, icon: iconName }, active, mobile = false) {
  const children = [icon(iconName, { size: mobile ? 18 : 20 }), h('span', { class: mobile ? 'portal-bottom-label' : 'portal-nav-label' }, mobile ? short : label)];
  if (badge) children.push(badgeNode());
  if (!href) return h('span', { 'aria-disabled': 'true' }, ...children, mobile ? '' : h('small', {}, 'Soon'));
  return h('a', { href, 'aria-current': key === active ? 'page' : null }, ...children);
}

/** Fills #portalSide and #portalBottom, which each portal page provides. */
export function mountPortalShell(active) {
  const side = document.getElementById('portalSide');
  const bottom = document.getElementById('portalBottom');
  side?.replaceChildren(
    h('div', { class: 'portal-brand' }, h('img', { src: '/images/logo.png', alt: '' }), h('span', {}, 'CFL')),
    h('nav', { class: 'portal-nav', 'aria-label': 'Student portal' }, ...ITEMS.map((entry) => item(entry, active))),
    h('div', { class: 'portal-spacer' }),
    h('nav', { class: 'portal-nav portal-account', 'aria-label': 'Account' },
      h('span', { class: 'portal-user-name', 'data-user-name': true }),
      settingsLink(),
      signOutLink()),
  );
  bottom?.replaceChildren(
    ...ITEMS.filter((entry) => ['dashboard', 'practice', 'schedule', 'messages', 'notifications'].includes(entry.key)).map((entry) => item(entry, active, true)),
    item(ITEMS.find((entry) => entry.key === 'progress'), active, true),
    settingsLink(),
    signOutLink({ mobile: true }),
  );
}
