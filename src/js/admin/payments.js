import { debounce, el, setBusy, setFieldError } from '@/utils/dom.js';
import {
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_PURPOSES, PAYMENT_PURPOSE_LABELS, formatKes, validatePayment,
} from '@/utils/payment-schema.js';
import { formatDate } from '@/utils/format.js';
import {
  assignPayment, recordPayment, restorePayment, reversePayment,
} from '@/services/payment-service.js';
import { createDialog } from './dialog.js';
import { studentInput } from './student-picker.js';

const PAGE = 50;

const todayText = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * The Payments workspace: the headline numbers, the ledger, and the three things an admin does to a
 * payment (record one, give it to a student, reverse it). Importing a file lives in payment-import-ui.js.
 */
export function initPayments({
  root = document, store, options, say,
} = {}) {
  const body = root.querySelector('#paymentsBody');
  if (!body) return { render() {}, openRecord() {} };
  const search = root.querySelector('#paymentSearch');
  const filter = root.querySelector('#paymentFilter');
  const status = root.querySelector('#paymentsStatus');
  const more = root.querySelector('#paymentsMore');
  const truncated = root.querySelector('#paymentsTruncated');
  const importsBody = root.querySelector('#importsBody');
  const tile = (id) => root.querySelector(id);
  const tiles = {
    collected: tile('#tileCollected'), month: tile('#tileMonth'), outstanding: tile('#tileOutstanding'), unassigned: tile('#tileUnassigned'),
  };
  let shown = PAGE;

  const refresh = async () => {
    try { await store.loadPayments(); } catch (error) { say?.(error.message || 'The payments could not be reloaded.', 'error'); }
  };

  /* ------------------------------------------------------------ record a payment */
  const recordForm = el('form', { id: 'recordPaymentForm', novalidate: true });
  const recordError = el('p', { class: 'form-alert', role: 'alert', 'data-kind': 'error', hidden: true });
  const recordFields = new Map();
  const studentBox = studentInput(options, { id: 'rp-student', label: 'Student' });
  const field = (key, label, control, hint) => {
    recordFields.set(key, control);
    return el('div', { class: 'form-group' }, el('label', { for: control.id, class: 'form-label' }, label), control, hint ? el('p', { class: 'hint' }, hint) : null);
  };
  const select = (id, values, labels, blank) => el('select', { id, class: 'form-select' },
    blank ? el('option', { value: '' }, blank) : null, ...values.map((value) => el('option', { value }, labels[value])));
  const input = (id, attrs = {}) => el('input', {
    id, class: 'form-control', type: 'text', autocomplete: 'off', ...attrs,
  });
  recordFields.set('studentId', studentBox);
  recordForm.append(
    recordError,
    el('div', { class: 'form-grid' },
      el('div', { class: 'form-group form-group--wide' },
        el('label', { for: 'rp-student', class: 'form-label' }, 'Student'), studentBox,
        el('p', { class: 'hint' }, 'Leave empty to record the money now and give it to a student later.')),
      field('amount', 'Amount (KES)', input('rp-amount', { inputmode: 'decimal', placeholder: '15,000' })),
      field('paidAt', 'Date received', input('rp-date', { type: 'date' })),
      field('method', 'Paid by', select('rp-method', PAYMENT_METHODS, PAYMENT_METHOD_LABELS, 'Choose…')),
      field('purpose', 'For', select('rp-purpose', PAYMENT_PURPOSES, PAYMENT_PURPOSE_LABELS)),
      field('reference', 'Receipt / reference', input('rp-reference'), 'M-Pesa code, bank slip or cheque number. A repeated reference is refused, so a payment is never counted twice.'),
      field('payerName', 'Paid by (name)', input('rp-payer')),
      field('payerPhone', 'Payer phone', input('rp-phone', { type: 'tel' })),
      el('div', { class: 'form-group form-group--wide' }, el('label', { for: 'rp-note', class: 'form-label' }, 'Note'), (() => {
        const node = input('rp-note'); recordFields.set('note', node); return node;
      })())),
  );
  const recordDialog = createDialog({ id: 'recordPaymentDialog', title: 'Record a payment', wide: true });
  const recordSave = el('button', { type: 'submit', class: 'btn btn-primary', form: 'recordPaymentForm' }, 'Record payment');
  const recordCancel = el('button', { type: 'button', class: 'btn btn-outline-secondary', onclick: () => recordDialog.close() }, 'Cancel');
  recordDialog.body.append(recordForm);
  recordDialog.footer.append(recordCancel, recordSave);

  const recordErrors = (errors) => {
    let first = null;
    recordFields.forEach((node, key) => {
      const message = errors[key];
      setFieldError(node, message ?? null);
      if (message) first ??= node;
    });
    if (first) first.focus();
    else if (Object.keys(errors).length) { recordError.textContent = Object.values(errors)[0]; recordError.hidden = false; }
  };

  function openRecord(uid = '') {
    recordForm.reset();
    recordError.hidden = true;
    recordFields.forEach((node) => setFieldError(node, null));
    recordFields.get('paidAt').value = todayText();
    studentBox.value = uid ? options.labelFor(uid) : '';
    recordDialog.open();
    (uid ? recordFields.get('amount') : studentBox).focus();
  }

  recordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    recordError.hidden = true;
    const studentId = options.resolve(studentBox.value);
    const draft = {
      studentId: studentId ?? '',
      amount: recordFields.get('amount').value,
      paidAt: recordFields.get('paidAt').value,
      method: recordFields.get('method').value,
      purpose: recordFields.get('purpose').value,
      reference: recordFields.get('reference').value,
      payerName: recordFields.get('payerName').value,
      payerPhone: recordFields.get('payerPhone').value,
      note: recordFields.get('note').value,
    };
    const checked = validatePayment(draft);
    const errors = { ...checked.errors };
    if (studentId === undefined) errors.studentId = 'Choose a student from the list, or leave this empty.';
    if (Object.keys(errors).length) { recordErrors(errors); return; }
    setBusy(recordSave, true, 'Recording…');
    try {
      await recordPayment({ ...checked.value });
      recordDialog.close();
      say?.(`Recorded ${formatKes(checked.value.amountMinor)}.`, 'success');
      await refresh();
    } catch (error) {
      if (error.code === 'already-exists' || /already/i.test(error.message ?? '')) recordErrors({ reference: error.message });
      else if (error.fieldErrors) recordErrors(error.fieldErrors);
      else { recordError.textContent = error.message || 'That could not be recorded. Try again.'; recordError.hidden = false; }
    } finally {
      setBusy(recordSave, false);
    }
  });

  /* ------------------------------------------------------------ give a payment to a student */
  let assigning = null;
  const assignNote = el('p', { class: 'muted' });
  const assignBox = studentInput(options, { id: 'as-student', label: 'Student' });
  const assignError = el('p', { class: 'form-alert', role: 'alert', 'data-kind': 'error', hidden: true });
  const assignForm = el('form', { id: 'assignForm', novalidate: true },
    assignNote, assignError,
    el('div', { class: 'form-group' }, el('label', { for: 'as-student', class: 'form-label' }, 'Student'), assignBox,
      el('p', { class: 'hint' }, 'Leave empty to move the payment back to unassigned.')));
  const assignDialog = createDialog({ id: 'assignDialog', title: 'Give this payment to a student' });
  const assignSave = el('button', { type: 'submit', class: 'btn btn-primary', form: 'assignForm' }, 'Save');
  assignDialog.body.append(assignForm);
  assignDialog.footer.append(el('button', { type: 'button', class: 'btn btn-outline-secondary', onclick: () => assignDialog.close() }, 'Cancel'), assignSave);

  assignForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const studentId = options.resolve(assignBox.value);
    if (studentId === undefined) { setFieldError(assignBox, 'Choose a student from the list.'); return; }
    setFieldError(assignBox, null);
    setBusy(assignSave, true, 'Saving…');
    try {
      await assignPayment({ paymentId: assigning.id, studentId: studentId ?? '' });
      assignDialog.close();
      say?.(studentId ? 'Payment given to the student.' : 'Payment moved to unassigned.', 'success');
      await refresh();
    } catch (error) {
      assignError.textContent = error.message || 'That could not be saved. Try again.';
      assignError.hidden = false;
    } finally {
      setBusy(assignSave, false);
    }
  });

  function openAssign(payment) {
    assigning = payment;
    assignError.hidden = true;
    setFieldError(assignBox, null);
    assignNote.textContent = `${formatKes(payment.amountMinor)} received ${formatDate(payment.paidAt)}${payment.payerName ? ` from ${payment.payerName}` : ''}.`;
    assignBox.value = payment.studentId ? options.labelFor(payment.studentId) : '';
    assignDialog.open();
    assignBox.focus();
  }

  /* ------------------------------------------------------------ reverse (a payment or a whole import) */
  let reversing = null; // { paymentId } or { batchId, label }
  const reverseNote = el('p', { class: 'muted' });
  const reverseReason = el('input', { id: 'rv-reason', class: 'form-control', type: 'text', maxlength: 200, autocomplete: 'off' });
  const reverseError = el('p', { class: 'form-alert', role: 'alert', 'data-kind': 'error', hidden: true });
  const reverseForm = el('form', { id: 'reverseForm', novalidate: true },
    reverseNote, reverseError,
    el('div', { class: 'form-group' }, el('label', { for: 'rv-reason', class: 'form-label' }, 'Why is this being reversed?'), reverseReason,
      el('p', { class: 'hint' }, 'Nothing is deleted. The payment stays in the ledger, marked reversed with this reason, and no longer counts.')));
  const reverseDialog = createDialog({ id: 'reverseDialog', title: 'Reverse payment' });
  const reverseSave = el('button', { type: 'submit', class: 'btn btn-danger', form: 'reverseForm' }, 'Reverse');
  reverseDialog.body.append(reverseForm);
  reverseDialog.footer.append(el('button', { type: 'button', class: 'btn btn-outline-secondary', onclick: () => reverseDialog.close() }, 'Cancel'), reverseSave);

  reverseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const reason = reverseReason.value.trim();
    if (!reason) { setFieldError(reverseReason, 'Say why, so the record makes sense later.'); return; }
    setFieldError(reverseReason, null);
    setBusy(reverseSave, true, 'Reversing…');
    try {
      const result = await reversePayment({ ...reversing, reason });
      reverseDialog.close();
      say?.(result.count === 1 ? 'Payment reversed.' : `${result.count} payments reversed.`, 'success');
      await Promise.all([refresh(), store.loadImports().catch(() => {})]);
    } catch (error) {
      reverseError.textContent = error.message || 'That could not be reversed. Try again.';
      reverseError.hidden = false;
    } finally {
      setBusy(reverseSave, false);
    }
  });

  function openReverse(target, description, title = 'Reverse payment') {
    reversing = target;
    reverseReason.value = '';
    reverseError.hidden = true;
    setFieldError(reverseReason, null);
    reverseNote.textContent = description;
    reverseDialog.setTitle(title);
    reverseDialog.open();
    reverseReason.focus();
  }

  async function restore(payment, button) {
    if (!window.confirm(`Restore this ${formatKes(payment.amountMinor)} payment so it counts again?`)) return;
    setBusy(button, true, 'Restoring…');
    try {
      await restorePayment({ paymentId: payment.id });
      say?.('Payment restored.', 'success');
      await refresh();
    } catch (error) {
      say?.(error.message || 'That could not be restored.', 'error');
    } finally {
      setBusy(button, false);
    }
  }

  /* ------------------------------------------------------------ ledger table */
  const nameOf = (payment) => (payment.studentId ? store.studentById(payment.studentId)?.displayName || 'Unknown student' : '');
  const haystack = (payment) => [payment.reference, payment.payerName, payment.payerPhone, payment.note, nameOf(payment), store.studentById(payment.studentId)?.studentNumber]
    .filter(Boolean).join(' ').toLowerCase();

  function visible() {
    const term = (search?.value ?? '').trim().toLowerCase();
    const want = filter?.value ?? '';
    return store.state.payments.filter((payment) => {
      if (term && !haystack(payment).includes(term)) return false;
      if (want === 'unassigned') return !payment.studentId && payment.status !== 'reversed';
      if (want === 'reversed') return payment.status === 'reversed';
      if (want) return payment.method === want && payment.status !== 'reversed';
      return true;
    });
  }

  function row(payment) {
    const reversed = payment.status === 'reversed';
    const restoreButton = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary' }, 'Restore');
    restoreButton.addEventListener('click', () => restore(payment, restoreButton));
    const actions = reversed
      ? [restoreButton]
      : [
        el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', onclick: () => openAssign(payment) }, payment.studentId ? 'Change student' : 'Give to student'),
        el('button', {
          type: 'button', class: 'btn btn-sm btn-outline-danger', onclick: () => openReverse({ paymentId: payment.id }, `${formatKes(payment.amountMinor)} received ${formatDate(payment.paidAt)}${payment.reference ? ` (${payment.reference})` : ''}.`),
        }, 'Reverse'),
      ];
    const owner = payment.studentId ? nameOf(payment) : null;
    return el('tr', { class: reversed ? 'is-reversed' : '' },
      el('td', {}, formatDate(payment.paidAt)),
      el('td', {}, owner ? el('strong', {}, owner) : el('span', { class: 'badge-status badge-pending' }, 'Unassigned'),
        payment.payerName ? el('br') : null, payment.payerName ? el('small', {}, `Paid by ${payment.payerName}`) : null),
      el('td', { class: 'num' }, formatKes(payment.amountMinor)),
      el('td', {}, PAYMENT_METHOD_LABELS[payment.method] ?? payment.method ?? '—', el('br'), el('small', {}, PAYMENT_PURPOSE_LABELS[payment.purpose] ?? '')),
      el('td', {}, payment.reference || '—'),
      el('td', {}, reversed
        ? el('span', { class: 'badge-status badge-rejected', title: payment.reverseReason || '' }, 'Reversed')
        : el('span', { class: 'badge-status badge-approved' }, 'Counted'),
      reversed && payment.reverseReason ? el('br') : null, reversed && payment.reverseReason ? el('small', {}, payment.reverseReason) : null),
      el('td', { class: 'actions' }, ...actions));
  }

  function renderImports() {
    if (!importsBody) return;
    const { imports, loaded } = store.state;
    if (!loaded.imports) { importsBody.replaceChildren(el('tr', {}, el('td', { colspan: 6, class: 'empty' }, 'Loading imports…'))); return; }
    if (!imports.length) { importsBody.replaceChildren(el('tr', {}, el('td', { colspan: 6, class: 'empty' }, 'No files imported yet.'))); return; }
    importsBody.replaceChildren(...imports.map((entry) => el('tr', {},
      el('td', {}, entry.fileName || 'Unnamed file'),
      el('td', {}, formatDate(entry.createdAt)),
      el('td', { class: 'num' }, String(entry.createdCount ?? 0)),
      el('td', { class: 'num' }, formatKes(entry.totalMinor ?? 0)),
      el('td', { class: 'num' }, `${entry.duplicateCount ?? 0} skipped${entry.problemCount ? `, ${entry.problemCount} failed` : ''}`),
      el('td', { class: 'actions' }, el('button', {
        type: 'button',
        class: 'btn btn-sm btn-outline-danger',
        onclick: () => openReverse({ batchId: entry.id }, `Every payment from ${entry.fileName || 'this file'} that is still counted will be reversed. This can be undone one payment at a time.`, 'Reverse import'),
      }, 'Reverse import')))));
  }

  function render() {
    renderImports();
    const { payments, loaded } = store.state;
    if (loaded.payments) {
      const sum = store.summary();
      if (tiles.collected) tiles.collected.textContent = formatKes(sum.collectedMinor);
      if (tiles.month) tiles.month.textContent = formatKes(sum.monthMinor);
      if (tiles.outstanding) tiles.outstanding.textContent = formatKes(sum.outstandingMinor);
      if (tiles.unassigned) tiles.unassigned.textContent = sum.unassignedCount ? `${sum.unassignedCount} · ${formatKes(sum.unassignedMinor)}` : 'None';
    }
    if (truncated) truncated.hidden = !store.state.paymentsTruncated;
    if (!loaded.payments) {
      body.replaceChildren(el('tr', {}, el('td', { colspan: 7, class: 'empty' }, 'Loading payments…')));
      return;
    }
    const list = visible();
    if (!payments.length) body.replaceChildren(el('tr', {}, el('td', { colspan: 7, class: 'empty' }, 'No payments yet. Record one, or import a bank or M-Pesa statement.')));
    else if (!list.length) body.replaceChildren(el('tr', {}, el('td', { colspan: 7, class: 'empty' }, 'No payment matches that search.')));
    else body.replaceChildren(...list.slice(0, shown).map(row));
    if (status) status.textContent = `${list.length} of ${payments.length} payments.`;
    if (more) {
      more.hidden = list.length <= shown;
      more.textContent = `Show ${Math.min(PAGE, list.length - shown)} more`;
    }
  }

  const rerender = () => { shown = PAGE; render(); };
  search?.addEventListener('input', debounce(rerender, 150));
  filter?.addEventListener('change', rerender);
  more?.addEventListener('click', () => { shown += PAGE; render(); });
  root.querySelector('#recordPaymentBtn')?.addEventListener('click', () => openRecord());
  store.subscribe(render);

  return {
    render, openRecord, openReverse, refresh,
  };
}
