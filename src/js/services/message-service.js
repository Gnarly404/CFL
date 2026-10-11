import {
  collection, doc, getDocs, limit, orderBy, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { call } from './callable.js';
import { dbService } from './firebase-db.js';
import { normaliseMessage } from '@/messages/state.js';

/** Every message the person is in, newest first. Rules need the query to name them via `participants`. */
export async function loadMessages(uid) {
  const snap = await getDocs(query(
    collection(dbService(), 'messages'),
    where('participants', 'array-contains', uid), orderBy('createdAt', 'desc'), limit(300),
  ));
  return snap.docs.map((d) => normaliseMessage(d.id, d.data(), uid));
}

/** Marks received messages as read. Rules let only the recipient change readAt. */
export async function markMessagesRead(ids) {
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(dbService());
    ids.slice(i, i + 400).forEach((id) => batch.update(doc(dbService(), 'messages', id), { readAt: serverTimestamp() }));
    await batch.commit();
  }
}

export const sendMessage = (recipientId, body) => call('sendMessage', { recipientId, body });

export async function loadContacts() {
  const data = await call('messageContacts', {});
  return Array.isArray(data?.contacts) ? data.contacts : [];
}
