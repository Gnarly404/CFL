import { createHash } from 'node:crypto';
import { onCall, HttpsError } from '../lib/secure-call.js';
import { buildRuntime } from '../lib/runtime.js';
import { requireRole } from '../lib/require-role.js';
import { CURRENCY, paymentFingerprint, validatePayment } from '../lib/shared/payment-schema.js';
import { displayNameOf } from '../lib/shared/student-record-schema.js';
import { cleanText } from '../lib/shared/validation.js';

const MAX_ROWS = 500;
const MAX_BATCH_REVERSALS = 2000;
const CONCURRENCY = 10;
const SHOWN_PROBLEMS = 50;
const BATCH_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const ALREADY_EXISTS = new Set([6, 'already-exists']);

const invalid = (message, details) => new HttpsError('invalid-argument', message, details);
const firstMessage = (errors) => Object.values(errors)[0] || 'Check the payment details.';

/**
 * A payment that has a reference (an M-Pesa receipt, a bank slip number) gets an id made from it, so the
 * same payment can never be saved twice, however many times a statement is imported.
 */
export const paymentIdFor = (method, reference) => `p_${createHash('sha256').update(`${method}|${reference}`).digest('hex').slice(0, 32)}`;

/** Looks a student up once per request: who they are and which number they pay under. */
function studentLookup({ db }) {
  const cache = new Map();
  return (uid) => {
    if (!cache.has(uid)) {
      cache.set(uid, (async () => {
        const [userSnap, recordSnap, studentSnap] = await Promise.all([
          db.collection('users').doc(uid).get(),
          db.collection('studentRecords').doc(uid).get(),
          db.collection('students').doc(uid).get(),
        ]);
        const user = userSnap.exists ? userSnap.data() : null;
        if (!user || user.role !== 'student') return null;
        const record = recordSnap.exists ? recordSnap.data() : {};
        const profile = studentSnap.exists ? studentSnap.data().profile ?? {} : {};
        return {
          uid,
          name: displayNameOf(record) || user.displayName || '',
          number: record.studentNumber || profile.applicationReference || '',
        };
      })());
    }
    return cache.get(uid);
  };
}

/** Saves one validated payment. Returns { status: 'created', id } or { status: 'duplicate', reason }. */
async function storePayment(deps, {
  value, student, source, batchId, actor, allowDuplicate = false,
}) {
  const { db, FieldValue, Timestamp } = deps;
  const fingerprint = paymentFingerprint(value);
  let ref;
  if (value.reference) {
    ref = db.collection('payments').doc(paymentIdFor(value.method, value.reference));
  } else {
    if (!allowDuplicate) {
      const same = await db.collection('payments').where('fingerprint', '==', fingerprint).get();
      if (same.docs.some((entry) => entry.data().status !== 'reversed')) return { status: 'duplicate', reason: 'details' };
    }
    ref = db.collection('payments').doc();
  }
  const record = {
    studentId: student?.uid ?? null,
    studentName: student?.name ?? '',
    studentNumber: student?.number ?? '',
    amountMinor: value.amountMinor,
    currency: CURRENCY,
    paidAt: Timestamp.fromDate(value.paidAt),
    method: value.method,
    purpose: value.purpose,
    reference: value.reference,
    payerName: value.payerName,
    payerPhone: value.payerPhone,
    note: value.note,
    fingerprint,
    source,
    batchId: batchId ?? null,
    status: 'confirmed',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.uid,
  };
  try {
    await ref.create(record);
  } catch (error) {
    if (ALREADY_EXISTS.has(error?.code)) return { status: 'duplicate', reason: 'reference' };
    throw error;
  }
  return { status: 'created', id: ref.id };
}

const DUPLICATE_TEXT = {
  reference: 'A payment with that method and reference is already recorded. If it was reversed, restore it from the ledger instead.',
  details: 'A payment with the same date, amount and payer is already recorded. Record it anyway only if it is a separate payment.',
};

/** Records one payment typed in by an administrator. */
export async function adminRecordPaymentCore(deps, { actor, data, now = new Date() }) {
  const { audit } = deps;
  const { ok, value, errors } = validatePayment(data, { now });
  if (!ok) throw invalid(firstMessage(errors), { fieldErrors: errors });
  let student = null;
  if (value.studentId) {
    student = await studentLookup(deps)(value.studentId);
    if (!student) throw new HttpsError('not-found', 'That student no longer exists.');
  }
  const outcome = await storePayment(deps, {
    value, student, source: 'manual', batchId: null, actor, allowDuplicate: data?.allowDuplicate === true,
  });
  if (outcome.status === 'duplicate') throw new HttpsError('already-exists', DUPLICATE_TEXT[outcome.reason], { duplicate: outcome.reason });
  await audit({
    actorId: actor.uid,
    action: 'payment.record',
    resource: { type: 'payment', id: outcome.id },
    metadata: { amountMinor: value.amountMinor, method: value.method, studentId: value.studentId },
  });
  return { paymentId: outcome.id };
}

/**
 * Saves rows read from a spreadsheet. The browser does the reading and matching; this re-checks every row
 * as if it had never seen it, because a browser can send anything.
 */
export async function adminImportPaymentsCore(deps, { actor, data, now = new Date() }) {
  const { db, FieldValue, audit } = deps;
  const rows = Array.isArray(data?.rows) ? data.rows : null;
  if (!rows?.length) throw invalid('Choose a file with at least one payment.');
  if (rows.length > MAX_ROWS) throw invalid(`Send at most ${MAX_ROWS} payments at a time.`);
  const batchId = typeof data?.batchId === 'string' && BATCH_ID_RE.test(data.batchId) ? data.batchId : '';
  if (!batchId) throw invalid('This import has no valid batch id. Reload the page and try again.');
  const fileName = cleanText(typeof data?.fileName === 'string' ? data.fileName : '').slice(0, 120);

  const lookup = studentLookup(deps);
  const tally = {
    created: 0, duplicates: 0, createdMinor: 0, problems: [],
  };
  const problem = (row, index, message) => tally.problems.push({ row: Number.isInteger(row?.rowNumber) ? row.rowNumber : index + 1, message });

  for (let start = 0; start < rows.length; start += CONCURRENCY) {
    await Promise.all(rows.slice(start, start + CONCURRENCY).map(async (row, offset) => {
      const index = start + offset;
      const { ok, value, errors } = validatePayment(row, { now });
      if (!ok) { problem(row, index, firstMessage(errors)); return; }
      let student = null;
      if (value.studentId) {
        student = await lookup(value.studentId);
        if (!student) { problem(row, index, 'That student no longer exists.'); return; }
      }
      const outcome = await storePayment(deps, {
        value, student, source: 'import', batchId, actor, allowDuplicate: row?.allowDuplicate === true,
      });
      if (outcome.status === 'duplicate') { tally.duplicates += 1; return; }
      tally.created += 1;
      tally.createdMinor += value.amountMinor;
    }));
  }

  // One summary per import, added to as each chunk of a large file arrives.
  const importRef = db.collection('paymentImports').doc(batchId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(importRef);
    const before = snap.exists ? snap.data() : {};
    tx.set(importRef, {
      fileName: before.fileName || fileName,
      createdCount: (before.createdCount ?? 0) + tally.created,
      duplicateCount: (before.duplicateCount ?? 0) + tally.duplicates,
      problemCount: (before.problemCount ?? 0) + tally.problems.length,
      totalMinor: (before.totalMinor ?? 0) + tally.createdMinor,
      createdBy: before.createdBy ?? actor.uid,
      createdAt: before.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await audit({
    actorId: actor.uid,
    action: 'payment.import',
    resource: { type: 'paymentImport', id: batchId },
    metadata: {
      fileName, created: tally.created, duplicates: tally.duplicates, problems: tally.problems.length, totalMinor: tally.createdMinor,
    },
  });
  return {
    batchId,
    created: tally.created,
    duplicates: tally.duplicates,
    createdMinor: tally.createdMinor,
    problems: tally.problems.slice(0, SHOWN_PROBLEMS),
    problemCount: tally.problems.length,
  };
}

/** Moves a payment to another student (or to none), for money that arrived without a clear owner. */
export async function adminAssignPaymentCore(deps, { actor, data }) {
  const { db, FieldValue, audit } = deps;
  const paymentId = typeof data?.paymentId === 'string' ? data.paymentId : '';
  const studentId = typeof data?.studentId === 'string' ? data.studentId.trim() : '';
  if (!paymentId) throw invalid('Choose a payment.');
  const ref = db.collection('payments').doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That payment no longer exists.');
  const payment = snap.data();
  if (payment.status === 'reversed') throw new HttpsError('failed-precondition', 'A reversed payment cannot be moved. Restore it first.');
  const student = studentId ? await studentLookup(deps)(studentId) : null;
  if (studentId && !student) throw new HttpsError('not-found', 'That student no longer exists.');
  await ref.update({
    studentId: student?.uid ?? null,
    studentName: student?.name ?? '',
    studentNumber: student?.number ?? '',
    assignedBy: actor.uid,
    assignedAt: FieldValue.serverTimestamp(),
  });
  await audit({
    actorId: actor.uid,
    action: 'payment.assign',
    resource: { type: 'payment', id: paymentId },
    metadata: { from: payment.studentId ?? null, to: student?.uid ?? null },
  });
  return { paymentId, studentId: student?.uid ?? null };
}

/**
 * Reverses a payment (or every payment of one import), or restores one that was reversed by mistake.
 * Nothing is deleted: a reversed payment stays in the ledger, out of the totals, with who and why.
 */
export async function adminReversePaymentCore(deps, { actor, data }) {
  const { db, FieldValue, audit } = deps;
  const restore = data?.restore === true;
  const reason = cleanText(typeof data?.reason === 'string' ? data.reason : '').slice(0, 200);
  const paymentId = typeof data?.paymentId === 'string' ? data.paymentId : '';
  const batchId = typeof data?.batchId === 'string' ? data.batchId : '';
  if (!paymentId && !batchId) throw invalid('Choose a payment or an import.');
  if (restore && !paymentId) throw invalid('Restore one payment at a time.');
  if (!restore && !reason) throw invalid('Say why the payment is being reversed.');

  let targets;
  if (paymentId) {
    const snap = await db.collection('payments').doc(paymentId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'That payment no longer exists.');
    const status = snap.data().status;
    if (restore && status !== 'reversed') throw new HttpsError('failed-precondition', 'That payment is not reversed.');
    if (!restore && status === 'reversed') throw new HttpsError('failed-precondition', 'That payment is already reversed.');
    targets = [db.collection('payments').doc(paymentId)];
  } else {
    const found = await db.collection('payments').where('batchId', '==', batchId).get();
    const live = found.docs.filter((entry) => entry.data().status !== 'reversed');
    if (live.length > MAX_BATCH_REVERSALS) throw invalid('That import is too large to reverse at once. Contact support.');
    targets = live.map((entry) => db.collection('payments').doc(entry.id));
  }

  const patch = restore
    ? {
      status: 'confirmed', reversedAt: null, reversedBy: null, reverseReason: '', restoredAt: FieldValue.serverTimestamp(), restoredBy: actor.uid,
    }
    : {
      status: 'reversed', reversedAt: FieldValue.serverTimestamp(), reversedBy: actor.uid, reverseReason: reason,
    };
  for (let start = 0; start < targets.length; start += CONCURRENCY) {
    await Promise.all(targets.slice(start, start + CONCURRENCY).map((ref) => ref.update(patch)));
  }
  await audit({
    actorId: actor.uid,
    action: restore ? 'payment.restore' : 'payment.reverse',
    resource: { type: paymentId ? 'payment' : 'paymentImport', id: paymentId || batchId },
    metadata: { count: targets.length, reason },
  });
  return { count: targets.length };
}

const guarded = (core) => onCall({ cors: true }, async (request) => {
  const deps = buildRuntime();
  const actor = await requireRole(request, ['admin'], deps);
  return core(deps, { actor, data: request.data });
});

export const adminRecordPayment = guarded(adminRecordPaymentCore);
export const adminImportPayments = guarded(adminImportPaymentsCore);
export const adminAssignPayment = guarded(adminAssignPaymentCore);
export const adminReversePayment = guarded(adminReversePaymentCore);
