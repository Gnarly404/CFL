import {
  collection, getDocs, limit, orderBy, query, where,
} from 'firebase/firestore';
import { call } from './callable.js';
import { AppError } from './errors.js';
import { dbService } from './firebase-db.js';

const toDate = (value) => (typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : null);
const shape = (entry) => {
  const data = entry.data();
  return { id: entry.id, ...data, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
};
const unreachable = () => new AppError('unavailable', "We can't reach the database right now. Check your connection and refresh.");

export const submitServiceRequest = ({
  requestType, details, reference, programmeId,
}) => call('submitServiceRequest', {
  requestType, details, reference, programmeId,
});
export const updateServiceRequest = ({
  requestId, status, response, nextAction, enrol,
}) => call('adminUpdateServiceRequest', {
  requestId, status, response, nextAction, enrol,
});

/** A student's own requests, newest first. */
export async function listMyServiceRequests(uid) {
  const snapshot = await getDocs(query(collection(dbService(), 'serviceRequests'), where('studentId', '==', uid)));
  if (snapshot.metadata?.fromCache) throw unreachable();
  return snapshot.docs.map(shape).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** The admin queue: the newest 300 requests. */
export async function listServiceRequests({ max = 300 } = {}) {
  const snapshot = await getDocs(query(collection(dbService(), 'serviceRequests'), orderBy('createdAt', 'desc'), limit(max)));
  if (snapshot.metadata?.fromCache) throw unreachable();
  return snapshot.docs.map(shape);
}
