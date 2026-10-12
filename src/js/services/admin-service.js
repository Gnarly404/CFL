import {
  collection, getCountFromServer, getDocs, limit, orderBy, query, where,
} from 'firebase/firestore';
import { call } from './callable.js';
import { AppError } from './errors.js';
import { dbService } from './firebase-db.js';
import { OPEN_STATUSES } from '@/utils/application-status.js';

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

export async function countOpenApplications() {
  const snap = await getCountFromServer(query(
    collection(dbService(), 'applications'), where('status', 'in', OPEN_STATUSES),
  ));
  return snap.data().count;
}

export async function listUsers({ max = 200 } = {}) {
  return rowsFromSnapshot(await getDocs(query(collection(dbService(), 'users'), orderBy('createdAt', 'desc'), limit(max))));
}

export const decideApplication = ({ applicationId, decision, note = '' }) => call('decideApplication', { applicationId, decision, note });
export const createUser = ({ email, displayName, role }) => call('adminCreateUser', { email, displayName, role });
export const setUserDisabled = ({ uid, disabled }) => call('adminSetUserStatus', { uid, disabled });
export const setUserRole = ({ uid, role }) => call('adminSetUserRole', { uid, role });
export const assignInstructor = ({ studentId, instructorId, assigned }) => call('adminAssignInstructor', { studentId, instructorId, assigned });
export const assignProgramme = ({ programmeId, instructorId, assigned }) => call('adminAssignProgramme', { programmeId, instructorId, assigned });
export const resendInvite = ({ uid }) => call('adminResendInvite', { uid });
export const reviewPrivacyRequest = ({ requestId, status, response, nextAction = '' }) => call('adminReviewPrivacyRequest', { requestId, status, response, nextAction });

export async function listPrivacyRequests({ max = 200 } = {}) {
  const rows = rowsFromSnapshot(await getDocs(query(collection(dbService(), 'privacyRequests'), limit(max))));
  return rows.sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
}

const toMillis = (value) => {
  const timestamp = value?.toMillis?.() ?? Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

/** Student records (admins can read them all): uid, instructorIds. Names and emails come from the user list. */
export async function listStudents({ max = 500 } = {}) {
  return rowsFromSnapshot(await getDocs(query(collection(dbService(), 'students'), limit(max)))).map(({ id, instructorIds }) => ({ uid: id, instructorIds: instructorIds ?? [] }));
}

/** Who teaches each programme (admins can read every record): a map of programmeId to instructor ids. */
export async function listProgrammeStaff({ max = 500 } = {}) {
  const rows = rowsFromSnapshot(await getDocs(query(collection(dbService(), 'programmeStaff'), limit(max))));
  return new Map(rows.map(({ id, instructorIds }) => [id, instructorIds ?? []]));
}
