import { canAccess, isSafeInternalPath } from '@/core/routes.js';

/** Pure helpers for the notification list. A notification here is { id, title, body, category, link, createdAtMs, read, archived }. */

export const CATEGORY_LABELS = Object.freeze({
  teacher: 'Teacher',
  practice: 'Practice',
  class: 'Class',
  application: 'Application',
  payment: 'Payment',
  system: 'System',
});
export const categoryLabel = (category) => CATEGORY_LABELS[category] ?? 'Update';

export const visible = (list) => list.filter((n) => !n.archived);
export const unreadCount = (list) => visible(list).filter((n) => !n.read).length;
export const applyFilter = (list, filter) => visible(list).filter((n) => filter !== 'unread' || !n.read);

/** A link is followed only if it stays inside the student's own area. Anything else is shown without a link. */
export function safeLink(link) {
  if (!isSafeInternalPath(link)) return null;
  return canAccess('student', link) && link.startsWith('/student') ? link : null;
}

export function timeAgo(ms, now = Date.now()) {
  if (!ms) return '';
  const minutes = Math.floor((now - ms) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ms).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}
