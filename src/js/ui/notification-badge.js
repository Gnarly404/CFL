import { watchUnreadNotifications } from '@/services/notification-service.js';
import { setAttentionBadge } from './attention-badge.js';

/** Shows the unread count on every [data-notification-count] element. Hidden when there is nothing unread. */
export function setBadge(count, root = document) {
  setAttentionBadge('notifications', count, root);
}

/** Watches the count for a page that is not itself the notification list. */
export function mountNotificationBadge(uid) {
  return watchUnreadNotifications(uid, setBadge, (error) => {
    console.warn('Could not load the notification count', error?.code ?? error);
  });
}
