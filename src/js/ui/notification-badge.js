import { loadNotifications } from '@/services/notification-service.js';
import { unreadCount } from '@/notifications/state.js';
import { h } from './h.js';

/** Shows the unread count on every [data-notification-count] element. Hidden when there is nothing unread. */
export function setBadge(count, root = document) {
  root.querySelectorAll('[data-notification-count]').forEach((node) => {
    node.hidden = count === 0;
    node.replaceChildren(
      h('span', { 'aria-hidden': 'true' }, count > 99 ? '99+' : String(count)),
      h('span', { class: 'visually-hidden' }, ` ${count} unread`),
    );
  });
}

/** Loads the count for a page that is not itself the notification list. A failure leaves the badge hidden. */
export async function mountNotificationBadge(uid) {
  try {
    setBadge(unreadCount(await loadNotifications(uid)));
  } catch (error) {
    console.warn('Could not load the notification count', error?.code ?? error);
  }
}
