import {
  collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { dbService } from './firebase-db.js';

const MAX = 100;

/** The student's newest notifications. Archived ones are included and filtered by the caller. */
export async function loadNotifications(uid) {
  const snap = await getDocs(query(
    collection(dbService(), 'notifications'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(MAX),
  ));
  return snap.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      title: data.title ?? '',
      body: data.body ?? '',
      category: data.category ?? '',
      link: data.link ?? null,
      createdAtMs: data.createdAt?.toMillis?.() ?? 0,
      read: Boolean(data.readAt),
      archived: Boolean(data.archivedAt),
    };
  });
}

/** Keeps the navigation unread count in sync while a student stays on a portal page. */
export function watchUnreadNotifications(uid, onCount, onError) {
  return onSnapshot(query(
    collection(dbService(), 'notifications'),
    where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(MAX),
  ), (snap) => {
    onCount(snap.docs.filter((entry) => {
      const data = entry.data();
      return !data.readAt && !data.archivedAt;
    }).length);
  }, onError);
}

const ref = (id) => doc(dbService(), 'notifications', id);

export const markRead = (id) => updateDoc(ref(id), { readAt: serverTimestamp() });
/** Archiving also marks it read, so it cannot linger in the unread count. */
export const archive = (id) => updateDoc(ref(id), { readAt: serverTimestamp(), archivedAt: serverTimestamp() });

export async function markAllRead(ids) {
  const batch = writeBatch(dbService());
  ids.forEach((id) => batch.update(ref(id), { readAt: serverTimestamp() }));
  await batch.commit();
}
