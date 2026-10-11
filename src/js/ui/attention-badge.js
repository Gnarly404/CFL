import { h } from './h.js';

export function attentionBadge(key) {
  return h('span', {
    class: 'nav-attention', 'data-attention-key': key, hidden: true, role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
  }, h('span', { 'aria-hidden': 'true' }));
}

export function setAttentionBadge(key, value, root = document) {
  const count = Math.max(0, Number(value) || 0);
  root.querySelectorAll(`[data-attention-key="${key}"]`).forEach((node) => {
    node.hidden = count === 0;
    const message = key === 'notifications'
      ? `${count} unread notifications`
      : key === 'applications'
        ? `${count} applications need attention`
        : `${count} writing submissions need feedback`;
    node.setAttribute('aria-label', message);
    node.replaceChildren(h('span', { 'aria-hidden': 'true' }, count > 99 ? '99+' : String(count)));
  });
}