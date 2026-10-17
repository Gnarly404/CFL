import {
  collection, getDocs, limit, orderBy, query, startAfter,
} from 'firebase/firestore';
import { call } from './callable.js';
import { dbService } from './firebase-db.js';
import { AppError } from './errors.js';

const toDate = (value) => {
  if (typeof value?.toDate === 'function') return value.toDate();
  return value instanceof Date ? value : null;
};

/** A ledger row as the console uses it: timestamps become Dates. */
const shape = (id, data) => ({
  id,
  ...data,
  paidAt: toDate(data.paidAt),
  createdAt: toDate(data.createdAt),
  reversedAt: toDate(data.reversedAt),
});

const PAGE = 500;
export const LEDGER_CAP = 5000;

/**
 * The whole ledger, newest first, read in pages. Totals and balances are worked out from it, so a silent
 * cut-off would make every balance wrong: when the cap is reached the result says so and the page warns.
 */
export async function listPayments({ cap = LEDGER_CAP } = {}) {
  const base = collection(dbService(), 'payments');
  const payments = [];
  let cursor = null;
  while (payments.length < cap) {
    const page = await getDocs(cursor
      ? query(base, orderBy('paidAt', 'desc'), startAfter(cursor), limit(PAGE))
      : query(base, orderBy('paidAt', 'desc'), limit(PAGE)));
    // An empty answer from the local cache means the database was unreachable, not that there are no payments.
    if (page.metadata?.fromCache) throw new AppError('unavailable', "We can't reach the database right now. Check your connection and refresh.");
    page.docs.forEach((entry) => payments.push(shape(entry.id, entry.data())));
    if (page.docs.length < PAGE) return { payments, truncated: false };
    cursor = page.docs.at(-1);
  }
  return { payments, truncated: true };
}

export async function listPaymentImports({ max = 50 } = {}) {
  const snapshot = await getDocs(query(collection(dbService(), 'paymentImports'), orderBy('createdAt', 'desc'), limit(max)));
  if (snapshot.metadata?.fromCache) throw new AppError('unavailable', "We can't reach the database right now. Check your connection and refresh.");
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return { id: entry.id, ...data, createdAt: toDate(data.createdAt) };
  });
}

/** One payment typed in by hand. `paidAt` is sent as text so the server reads it the same way everywhere. */
export const recordPayment = (payment) => call('adminRecordPayment', {
  ...payment,
  paidAt: payment.paidAt instanceof Date ? payment.paidAt.toISOString() : payment.paidAt,
});

export const importPayments = ({ batchId, fileName, rows }) => call('adminImportPayments', {
  batchId,
  fileName,
  rows: rows.map((row) => ({ ...row, paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : row.paidAt })),
});

export const assignPayment = ({ paymentId, studentId }) => call('adminAssignPayment', { paymentId, studentId });
export const reversePayment = ({ paymentId, batchId, reason }) => call('adminReversePayment', { paymentId, batchId, reason });
export const restorePayment = ({ paymentId }) => call('adminReversePayment', { paymentId, restore: true });
