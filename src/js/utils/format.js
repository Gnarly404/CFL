/** Formats a Firestore Timestamp (or Date) for display; returns an em dash when missing. */
export function formatDate(value, locale = 'en-KE') {
  const date = typeof value?.toDate === 'function' ? value.toDate() : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
