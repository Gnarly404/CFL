/** Pure helpers for the message centre. Keep MAX_BODY equal to the server's limit (a test checks this). */
export const MAX_BODY = 2000;

const ms = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : Number(value) || 0);

export function normaliseMessage(id, data = {}, uid) {
  return {
    id,
    threadId: String(data.threadId ?? ''),
    studentId: String(data.studentId ?? ''),
    instructorId: String(data.instructorId ?? ''),
    studentName: String(data.studentName ?? ''),
    instructorName: String(data.instructorName ?? ''),
    senderId: String(data.senderId ?? ''),
    recipientId: String(data.recipientId ?? ''),
    kind: String(data.kind ?? 'direct'),
    body: String(data.body ?? ''),
    createdAtMs: ms(data.createdAt),
    read: data.readAt != null,
    mine: data.senderId === uid,
  };
}

/** Conversations for one person: each with the other person's id and name, messages oldest first, and an unread count. */
export function buildThreads(messages, uid, role) {
  const byThread = new Map();
  messages.filter((m) => m.threadId).forEach((m) => {
    if (!byThread.has(m.threadId)) byThread.set(m.threadId, []);
    byThread.get(m.threadId).push(m);
  });
  return [...byThread.entries()].map(([threadId, list]) => {
    const sorted = [...list].sort((a, b) => a.createdAtMs - b.createdAtMs);
    const last = sorted[sorted.length - 1];
    const student = role === 'student';
    return {
      threadId,
      otherId: student ? last.instructorId : last.studentId,
      otherName: (student ? last.instructorName : last.studentName) || (student ? 'Your teacher' : 'Student'),
      messages: sorted,
      last,
      announcementOnly: sorted.every((message) => message.kind === 'class_announcement'),
      unread: sorted.filter((m) => m.recipientId === uid && !m.read).length,
    };
  }).sort((a, b) => b.last.createdAtMs - a.last.createdAtMs);
}

/**
 * The inbox list: every conversation, then every contact you have not written to yet.
 * `canSend` is false for a conversation with someone who is no longer one of your contacts.
 */
export function inboxEntries(threads, contacts) {
  const contactIds = new Set(contacts.map((c) => c.uid));
  const withThread = new Set(threads.map((t) => t.otherId));
  return [
    ...threads.map((t) => ({ ...t, canSend: contactIds.has(t.otherId) })),
    ...contacts.filter((c) => !withThread.has(c.uid))
      .map((c) => ({ threadId: null, otherId: c.uid, otherName: c.name, messages: [], last: null, unread: 0, canSend: true }))
      .sort((a, b) => a.otherName.localeCompare(b.otherName)),
  ];
}

export function cleanDraft(text) {
  // eslint-disable-next-line no-control-regex
  const value = String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
  if (!value) return { ok: false, error: 'Write a message first.', value };
  if (value.length > MAX_BODY) return { ok: false, error: `Keep messages under ${MAX_BODY} characters.`, value };
  return { ok: true, value };
}

export const previewOf = (text, max = 80) => {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
