import { collection, getDocs, query, where } from 'firebase/firestore';
import { call } from './callable.js';
import { AppError } from './errors.js';
import { dbService } from './firebase-db.js';

export const submitPrivacyRequest = ({ requestType, correctionCategory, details }) => call('submitPrivacyRequest', {
  requestType, correctionCategory, details,
});

export async function listMyPrivacyRequests(uid) {
  const snapshot = await getDocs(query(
    collection(dbService(), 'privacyRequests'),
    where('studentId', '==', uid),
  ));
  if (snapshot.metadata?.fromCache) throw new AppError('unavailable', "We can't reach the database right now. Check your connection and refresh.");
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
    .sort((left, right) => dateMs(right.createdAt) - dateMs(left.createdAt));
}

const dateMs = (value) => {
  const timestamp = value?.toMillis?.() ?? Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};