import { timeAgo } from '@/notifications/state.js';
import { h } from '@/ui/h.js';
import {
  buildThreads, cleanDraft, inboxEntries, MAX_BODY, previewOf,
} from './state.js';

/**
 * The message centre for one signed-in person. Pages pass in the services so this stays testable.
 * Elements it fills: #inboxSummary, #inboxNote, #inboxList, #inboxThread, inside #inbox.
 */
export async function mountInbox({
  root = document, viewer, services, params = new URLSearchParams(window.location.search), setUrl = (search) => window.history.replaceState({}, '', search),
}) {
  const $ = (id) => root.getElementById(id);
  const note = (text) => { $('inboxNote').hidden = !text; $('inboxNote').textContent = text; };
  let messages = [];
  let contacts = [];
  let active = params.get('with') || null;
  let draft = '';
  let sending = false;
  let failed = false;

  const entries = () => inboxEntries(buildThreads(messages, viewer.uid, viewer.role), contacts);
  const current = () => entries().find((e) => e.otherId === active) ?? null;

  function select(otherId) {
    active = otherId;
    draft = '';
    note('');
    setUrl(otherId ? `?with=${encodeURIComponent(otherId)}` : window.location.pathname);
    draw();
    readThread();
    if (otherId) $('inboxMessage')?.focus();
  }

  async function readThread() {
    const entry = current();
    const ids = entry ? entry.messages.filter((m) => m.recipientId === viewer.uid && !m.read).map((m) => m.id) : [];
    if (!ids.length) return;
    try {
      await services.markRead(ids);
      messages = messages.map((m) => (ids.includes(m.id) ? { ...m, read: true } : m));
      draw();
    } catch (error) {
      console.warn('Could not mark messages as read', error?.code ?? error);
    }
  }

  async function refresh() {
    messages = await services.load(viewer.uid);
  }

  async function send(entry) {
    const result = cleanDraft(draft);
    if (!result.ok) { note(result.error); return; }
    sending = true; note(''); draw();
    try {
      await services.send(entry.otherId, result.value);
      draft = '';
      try { await refresh(); } catch (error) { console.warn('Could not refresh messages', error?.code ?? error); }
    } catch (error) {
      console.warn('Could not send the message', error?.code ?? error);
      note(error?.message || 'Your message could not be sent. It is still here. Try again.');
    }
    sending = false;
    draw();
    $('inboxMessage')?.focus();
    const list = $('inboxMessages');
    if (list) list.scrollTop = list.scrollHeight;
  }

  function listRow(entry) {
    const open = h('button', {
      type: 'button', class: `thread-row${entry.otherId === active ? ' is-active' : ''}${entry.unread ? ' is-unread' : ''}`,
      'aria-current': entry.otherId === active ? 'true' : null,
    },
    h('span', { class: 'thread-name' }, entry.otherName, entry.unread ? h('span', { class: 'nav-badge' }, String(entry.unread), h('span', { class: 'visually-hidden' }, ' unread')) : ''),
    h('span', { class: 'thread-preview muted' }, entry.last ? `${entry.last.mine ? 'You: ' : ''}${previewOf(entry.last.body)}` : 'Start a conversation'),
    entry.last ? h('span', { class: 'thread-time muted' }, timeAgo(entry.last.createdAtMs)) : '');
    open.addEventListener('click', () => select(entry.otherId));
    return h('li', {}, open);
  }

  function thread(entry) {
    const bubbles = entry.messages.length
      ? entry.messages.map((m) => h('li', { class: `bubble ${m.mine ? 'mine' : 'theirs'}` },
        h('p', { class: 'bubble-text' }, m.body),
        h('span', { class: 'bubble-time muted' }, `${m.mine ? 'You' : entry.otherName}${m.kind === 'class_announcement' ? ' · Class announcement' : ''} · ${timeAgo(m.createdAtMs)}`)))
      : [h('li', { class: 'muted' }, `No messages yet. Say hello to ${entry.otherName}.`)];
    const back = h('button', { type: 'button', class: 'btn inbox-back' }, 'All conversations');
    back.addEventListener('click', () => select(null));
    const box = h('textarea', { id: 'inboxMessage', rows: 3, class: 'writing-box', maxlength: MAX_BODY });
    box.value = draft;
    box.addEventListener('input', () => { draft = box.value; const c = $('inboxCount'); if (c) c.textContent = `${draft.length} / ${MAX_BODY}`; });
    box.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); send(entry); } });
    const sendButton = h('button', { type: 'button', class: 'btn btn-primary', id: 'inboxSend' }, sending ? 'Sending…' : 'Send');
    sendButton.disabled = sending;
    sendButton.addEventListener('click', () => send(entry));
    return [
      back,
      h('h2', {}, entry.otherName),
      h('ul', { class: 'bubbles', id: 'inboxMessages', 'aria-live': 'polite', 'aria-label': `Conversation with ${entry.otherName}` }, ...bubbles),
      entry.canSend
        ? h('div', { class: 'composer' },
          h('label', { for: 'inboxMessage', class: 'eyebrow' }, `Message to ${entry.otherName}`), box,
          h('div', { class: 'actions' }, sendButton, h('span', { id: 'inboxCount', class: 'muted' }, `${draft.length} / ${MAX_BODY}`)))
        : h('p', { class: 'muted' }, entry.announcementOnly ? 'Class announcements are read-only. Contact your assigned teacher if you have a question.' : 'You can no longer send messages to this person.'),
    ];
  }

  function draw() {
    if (failed) return;
    const all = entries();
    const unread = all.reduce((sum, e) => sum + e.unread, 0);
    const entry = current();
    $('inbox').classList.toggle('inbox--open', Boolean(entry));
    $('inboxSummary').textContent = all.length
      ? `${unread} unread · ${all.length} ${all.length === 1 ? 'conversation' : 'conversations'}`
      : (viewer.role === 'student' ? 'You have no teacher assigned yet, so there is nobody to message.' : 'You have no assigned students yet, so there is nobody to message.');
    $('inboxList').replaceChildren(...all.map(listRow));
    $('inboxThread').replaceChildren(...(entry ? thread(entry) : [h('p', { class: 'muted' }, all.length ? 'Choose a conversation.' : '')]));
  }

  const [loaded, people] = await Promise.allSettled([services.load(viewer.uid), services.contacts()]);
  if (loaded.status === 'rejected') {
    console.warn('Could not load messages', loaded.reason?.code ?? loaded.reason);
    failed = true;
    $('inboxSummary').textContent = 'Your messages could not be loaded.';
    note('Check your connection and refresh the page.');
    return;
  }
  messages = loaded.value;
  if (people.status === 'fulfilled') contacts = people.value;
  else {
    console.warn('Could not load contacts', people.reason?.code ?? people.reason);
    note('Your contacts could not be loaded, so you can only reply to existing conversations. Refresh to try again.');
  }
  draw();
  readThread();
}
