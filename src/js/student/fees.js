import { el } from '@/utils/dom.js';
import { PAYMENT_METHOD_LABELS, PAYMENT_PURPOSE_LABELS, balanceState, formatKes } from '@/utils/payment-schema.js';

const date = (value) => (value instanceof Date && !Number.isNaN(value.getTime())
  ? value.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const toDate = (value) => (typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : null);

/**
 * What a student sees of their own fees. Only tuition payments that still count reduce the balance, the same
 * rule the admin console uses, so the two screens always agree. Admin-only fields (notes, reasons, batches)
 * never reach this view.
 */
export function buildFeesView({ feeDueMinor, payments = [] } = {}) {
  const rows = payments
    .map((payment) => ({
      id: payment.id,
      paidAt: toDate(payment.paidAt),
      amountMinor: payment.amountMinor,
      method: payment.method,
      purpose: payment.purpose,
      reference: payment.reference || '',
      reversed: payment.status === 'reversed',
    }))
    .filter((row) => Number.isInteger(row.amountMinor))
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  const paidMinor = rows.filter((row) => !row.reversed && row.purpose === 'tuition').reduce((sum, row) => sum + row.amountMinor, 0);
  const fee = Number.isInteger(feeDueMinor) && feeDueMinor > 0 ? feeDueMinor : null;
  return {
    rows, paidMinor, feeDueMinor: fee, balance: balanceState(fee, paidMinor), hasAnything: fee !== null || rows.length > 0,
  };
}

/** Fills the "Fees and payments" card. Built with el(), never innerHTML. */
export function renderFees(container, view) {
  container.classList.toggle('student-empty-state', !view.hasAnything);
  if (!view.hasAnything) {
    container.replaceChildren(
      el('strong', {}, 'No fees or payments recorded yet.'),
      el('p', {}, 'Once the Centre records a payment or sets your fees, they appear here.'));
    return;
  }
  const { balance } = view;
  const line = (label, value) => [el('dt', {}, label), el('dd', {}, value)];
  const summary = el('dl', { class: 'fees-summary' },
    ...(view.feeDueMinor !== null ? line('Fees agreed', formatKes(view.feeDueMinor)) : []),
    ...line('Tuition paid', formatKes(view.paidMinor)),
    ...(balance.balanceMinor !== null ? line(balance.balanceMinor < 0 ? 'Overpaid by' : 'Balance to pay', formatKes(Math.abs(balance.balanceMinor))) : []));
  const list = view.rows.length
    ? el('ul', { class: 'fees-list' }, ...view.rows.slice(0, 20).map((row) => el('li', { class: row.reversed ? 'is-reversed' : '' },
      el('span', {}, date(row.paidAt)),
      el('strong', {}, formatKes(row.amountMinor)),
      el('span', { class: 'muted' }, [PAYMENT_PURPOSE_LABELS[row.purpose], PAYMENT_METHOD_LABELS[row.method], row.reference].filter(Boolean).join(' · ')),
      row.reversed ? el('span', { class: 'badge-status badge-rejected' }, 'Reversed') : null)))
    : el('p', { class: 'muted' }, 'No payments recorded yet.');
  container.replaceChildren(
    el('p', {}, el('span', { class: 'badge-status', 'data-balance': balance.key }, balance.label)),
    summary, list,
    view.rows.length > 20 ? el('p', { class: 'muted' }, `Showing your latest 20 of ${view.rows.length} payments.`) : null);
}
