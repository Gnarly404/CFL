import { loadNotifications } from '@/services/notification-service.js';
import { unreadCount } from '@/notifications/state.js';
import { setAttentionBadge } from './attention-badge.js';

/** Shows the unread count on every [data-notification-count] element. Hidden when there is nothing unread. */
export function setBadge(count, root = document) {
  setAttentionBadge('notifications', count, root);
}

/** Loads the count for a page that is not itself the notification list. A failure leaves the badge hidden. */
export async function mountNotificationBadge(uid) {
  try {
    setBadge(unreadCount(await loadNotifications(uid)));
  } catch (error) {
    console.warn('Could not load the notification count', error?.code ?? error);
  }
}
