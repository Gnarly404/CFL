import {
  collection, getDocs, limit, orderBy, query, where,
} from 'firebase/firestore';
import { call } from './callable.js';
import { AppError } from './errors.js';
import { dbService } from './firebase-db.js';

/**
 * Turns a query snapshot into plain rows. An empty answer that came from the local cache means the
 * database was unreachable, and showing "no applications" would be wrong, so it becomes an error instead.
 */
export function rowsFromSnapshot(snapshot) {
  if (snapshot.metadata?.fromCache) {
    throw new AppError('unavailable', "We can't reach the database right now. Check your connection and refresh.");
  }
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listApplications({ status = null, max = 100 } = {}) {
  const base = collection(dbService(), 'applications');
  const q = status
    ? query(base, where('status', '==', status), orderBy('createdAt', 'desc'), limit(max))
    : query(base, orderBy('createdAt', 'desc'), limit(max));
  return rowsFromSnapshot(await getDocs(q));
}

export async function listUsers({ max = 200 } = {}) {
  return rowsFromSnapshot(await getDocs(query(collection(dbService(), 'users'), orderBy('createdAt', 'desc'), limit(max))));
}

export const decideApplication = ({ applicationId, decision, note = '' }) => call('decideApplication', { applicationId, decision, note });
export const createUser = ({ email, displayName, role }) => call('adminCreateUser', { email, displayName, role });
export const setUserDisabled = ({ uid, disabled }) => call('adminSetUserStatus', { uid, disabled });
export const setUserRole = ({ uid, role }) => call('adminSetUserRole', { uid, role });
export const resendInvite = ({ uid }) => call('adminResendInvite', { uid });
