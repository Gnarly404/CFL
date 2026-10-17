import { balanceState, paymentFingerprint } from '@/utils/payment-schema.js';

/**
 * Sums and checks over the payment ledger. All money is integer cents. Reversed payments stay in the ledger
 * (with who reversed them and why) but never count towards a total.
 */

const EAT_OFFSET_MS = 3 * 3600 * 1000;

const counts = (payment) => payment.status !== 'reversed';

/** Midnight at the start of this month in Nairobi, as an instant. */
export function startOfMonthEat(now = new Date()) {
  const local = new Date(now.getTime() + EAT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - EAT_OFFSET_MS);
}

/**
 * What each student has paid. Only tuition counts against the fees agreed; an application fee or a one-off
 * payment is shown but does not reduce the balance.
 * @returns {Map<string, { tuitionMinor: number, otherMinor: number, count: number, lastPaidAt: Date|null }>}
 */
export function totalsByStudent(payments) {
  const totals = new Map();
  for (const payment of payments) {
    if (!payment.studentId || !counts(payment)) continue;
    const entry = totals.get(payment.studentId) ?? {
      tuitionMinor: 0, otherMinor: 0, count: 0, lastPaidAt: null,
    };
    if (payment.purpose === 'tuition') entry.tuitionMinor += payment.amountMinor;
    else entry.otherMinor += payment.amountMinor;
    entry.count += 1;
    if (payment.paidAt && (!entry.lastPaidAt || payment.paidAt > entry.lastPaidAt)) entry.lastPaidAt = payment.paidAt;
    totals.set(payment.studentId, entry);
  }
  return totals;
}

/** Where one student stands: fees agreed against tuition paid. */
export function studentBalance(student, totals) {
  const paid = totals.get(student.uid)?.tuitionMinor ?? 0;
  return { paidMinor: paid, ...balanceState(student.feeDueMinor, paid) };
}

/** The headline numbers for the Payments page. */
export function ledgerSummary(payments, students, now = new Date()) {
  const monthStart = startOfMonthEat(now).getTime();
  const totals = totalsByStudent(payments);
  const summary = {
    collectedMinor: 0, monthMinor: 0, unassignedCount: 0, unassignedMinor: 0, outstandingMinor: 0, withBalance: 0,
  };
  for (const payment of payments) {
    if (!counts(payment)) continue;
    summary.collectedMinor += payment.amountMinor;
    if (payment.paidAt && payment.paidAt.getTime() >= monthStart) summary.monthMinor += payment.amountMinor;
    if (!payment.studentId) {
      summary.unassignedCount += 1;
      summary.unassignedMinor += payment.amountMinor;
    }
  }
  for (const student of students) {
    const { balanceMinor } = studentBalance(student, totals);
    if (balanceMinor > 0) {
      summary.outstandingMinor += balanceMinor;
      summary.withBalance += 1;
    }
  }
  return summary;
}

/**
 * What is already in the ledger, so an import can say "already recorded" before anything is sent. This mirrors
 * the server: a payment with a reference is the same payment when method and reference match (even if it was
 * reversed, because the server will not create it twice); one without is the same when date, amount and payer match.
 */
export function existingKeys(payments) {
  const references = new Map();
  const fingerprints = new Set();
  for (const payment of payments) {
    if (payment.reference) references.set(`${payment.method}|${payment.reference}`, payment.status === 'reversed');
    else if (payment.status !== 'reversed') {
      // The server stored the fingerprint when it saved the payment; use that rather than working it out again.
      const stored = payment.fingerprint || (payment.paidAt ? paymentFingerprint({
        paidAt: payment.paidAt, amountMinor: payment.amountMinor, payerPhone: payment.payerPhone, payerName: payment.payerName,
      }) : '');
      if (stored) fingerprints.add(stored);
    }
  }
  return { references, fingerprints };
}

/** @returns {'' | 'reversed' | 'recorded'} whether a row from a file is already in the ledger. */
export function alreadyRecorded(candidate, keys) {
  if (candidate.reference && candidate.method) {
    const reversed = keys.references.get(`${candidate.method}|${candidate.reference}`);
    if (reversed === undefined) return '';
    return reversed ? 'reversed' : 'recorded';
  }
  if (!candidate.reference && candidate.paidAt && candidate.amountMinor) {
    const fingerprint = paymentFingerprint({
      paidAt: candidate.paidAt, amountMinor: candidate.amountMinor, payerPhone: candidate.payerPhone, payerName: candidate.payerName,
    });
    return keys.fingerprints.has(fingerprint) ? 'recorded' : '';
  }
  return '';
}
