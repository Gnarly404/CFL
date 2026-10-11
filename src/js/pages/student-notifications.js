import { guardPage } from '@/auth/guards.js';
import {
  applyFilter, categoryLabel, safeLink, timeAgo, unreadCount, visible,
} from '@/notifications/state.js';
import { archive, loadNotifications, markAllRead, markRead } from '@/services/notification-service.js';
import { h } from '@/ui/h.js';
import { navigate } from '@/ui/navigate.js';
import { setBadge } from '@/ui/notification-badge.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('notifications');
const session = await guardPage({ roles: ['student'] });
const $ = (id) => document.getElementById(id);
const note = (text, kind = 'error') => {
  $('notifNote').hidden = !text;
  $('notifNote').dataset.kind = kind;
  $('notifNote').textContent = text;
};

let list = null;
let filter = 'all';
try {
  list = await loadNotifications(session.user.uid);
} catch (error) {
  console.warn('Could not load notifications', error?.code ?? error);
  $('notifSummary').textContent = 'Your notifications could not be loaded.';
  note('Check your connection and refresh the page.');
  $('notifFilters').hidden = true;
}

const patch = (id, changes) => { list = list.map((n) => (n.id === id ? { ...n, ...changes } : n)); };

async function act(label, work, apply, successMessage) {
  note('');
  try {
    await work();
    apply();
    note(successMessage, 'success');
  } catch (error) {
    console.warn(`Could not ${label}`, error?.code ?? error);
    note(`Could not ${label}. Try again.`);
  }
  draw();
}

function row(n) {
  const link = safeLink(n.link);
  const actions = [];
  if (link) {
    const open = h('a', { class: 'btn btn-primary', href: link, 'aria-label': `Open: ${n.title}` }, 'Open');
    open.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!n.read) {
        try {
          await markRead(n.id);
          patch(n.id, { read: true });
          draw();
        } catch (error) {
          console.warn('Could not mark as read', error?.code ?? error);
        }
      }
      navigate(link);
    });
    actions.push(open);
  }
  if (!n.read) {
    const read = h('button', { class: 'btn', type: 'button', 'aria-label': `Mark as read: ${n.title}` }, 'Mark as read');
    read.addEventListener('click', () => act(
      'mark it as read', () => markRead(n.id), () => patch(n.id, { read: true }), 'Notification marked as read.',
    ));
    actions.push(read);
  }
  const remove = h('button', { class: 'btn', type: 'button', 'aria-label': `Archive: ${n.title}` }, 'Archive');
  remove.addEventListener('click', () => act(
    'archive it', () => archive(n.id), () => patch(n.id, { read: true, archived: true }), 'Notification archived.',
  ));
  actions.push(remove);
  return h('li', { class: `notif${n.read ? '' : ' is-unread'}`, 'data-id': n.id },
    h('div', { class: 'notif-meta' }, h('span', { class: 'badge' }, categoryLabel(n.category)), n.read ? '' : h('strong', {}, 'Unread'), h('span', {}, timeAgo(n.createdAtMs))),
    h('h3', {}, n.title),
    n.body ? h('p', {}, n.body) : '',
    h('div', { class: 'actions' }, ...actions));
}

function draw() {
  if (!list) return;
  const unread = unreadCount(list);
  const all = visible(list);
  $('notifSummary').textContent = all.length ? `${unread} unread · ${all.length} in total` : 'You have no notifications.';
  $('markAll').hidden = unread === 0;
  document.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
  const shown = applyFilter(list, filter);
  $('notifList').replaceChildren(...(shown.length ? shown.map(row)
    : [h('li', { class: 'muted' }, filter === 'unread' && all.length ? 'Nothing unread.' : 'Nothing here yet. Teacher feedback and other updates will appear here.')]));
  setBadge(unread);
}

document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; draw(); }));
$('markAll').addEventListener('click', () => {
  const ids = visible(list).filter((n) => !n.read).map((n) => n.id);
  if (ids.length) act('mark them all as read', () => markAllRead(ids), () => ids.forEach((id) => patch(id, { read: true })));
});
draw();
