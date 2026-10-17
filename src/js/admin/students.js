import {
  debounce, el, setBusy, setFieldError,
} from '@/utils/dom.js';
import {
  GENDERS, IDENTIFICATION_TYPES, QUALIFICATIONS, RELATIONSHIPS,
} from '@/utils/application-schema.js';
import { STUDENT_RECORD_LABELS, validateStudentRecord } from '@/utils/student-record-schema.js';
import { PAYMENT_METHOD_LABELS, formatKes, parseAmountMinor } from '@/utils/payment-schema.js';
import { formatDate } from '@/utils/format.js';
import { getStudentRecord, saveStudentRecord } from '@/services/student-record-service.js';
import { createDialog } from './dialog.js';

const PAGE = 50;

const GENDER_LABELS = { male: 'Male', female: 'Female', other: 'Other' };
const RELATIONSHIP_LABELS = {
  parent: 'Parent', guardian: 'Guardian', sibling: 'Sibling', other: 'Other',
};
const ID_LABELS = { national_id: 'National ID', passport: 'Passport', birth_certificate: 'Birth certificate' };
const QUALIFICATION_LABELS = {
  none: 'No formal qualification yet',
  primary: 'Primary school certificate',
  secondary: 'Secondary school certificate',
  certificate: 'Certificate',
  diploma: 'Diploma',
  bachelors: "Bachelor's degree",
  postgraduate: 'Postgraduate qualification',
  other: 'Other qualification',
};
const options = (values, labels) => values.map((value) => ({ value, label: labels[value] ?? value }));

/** What the editor shows, in order. Labels come from the shared schema so the form and the server agree. */
const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'firstName', autocomplete: 'off' },
      { key: 'middleName' },
      { key: 'surname' },
      { key: 'dateOfBirth', type: 'date' },
      { key: 'gender', choices: options(GENDERS, GENDER_LABELS) },
      { key: 'nationality' },
    ],
  },
  {
    title: 'Contact and residence',
    fields: [
      { key: 'phoneNumber', type: 'tel' },
      { key: 'countryOfResidence' },
      { key: 'residentialAddress', wide: true },
    ],
  },
  {
    title: 'Emergency contact',
    fields: [
      { key: 'contactName' },
      { key: 'contactRelationship', choices: options(RELATIONSHIPS, RELATIONSHIP_LABELS) },
      { key: 'contactPhone', type: 'tel' },
    ],
  },
  {
    title: 'Education',
    fields: [
      { key: 'highestQualification', choices: options(QUALIFICATIONS, QUALIFICATION_LABELS) },
      { key: 'institutionAttended' },
      { key: 'completionYear', type: 'text', inputmode: 'numeric' },
    ],
  },
  {
    title: 'Identification',
    fields: [
      { key: 'identificationType', choices: options(IDENTIFICATION_TYPES, ID_LABELS) },
      { key: 'identificationNumber' },
    ],
  },
  {
    title: 'Account and fees',
    fields: [
      { key: 'studentNumber', hint: 'Used to match payments. Letters, numbers, dots, slashes and hyphens.' },
      { key: 'feeDueMinor', money: true, label: 'Fees agreed (KES)', hint: 'Compared with the tuition paid to show the balance.' },
    ],
  },
];
const FIELD_KEYS = SECTIONS.flatMap((section) => section.fields.map((field) => field.key));
const inputId = (key) => `sr-${key}`;

const moneyText = (minor) => {
  if (!Number.isInteger(minor)) return '';
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
};

function buildField(field) {
  const id = inputId(field.key);
  const label = field.label ?? STUDENT_RECORD_LABELS[field.key];
  let control;
  if (field.choices) {
    control = el('select', { id, class: 'form-select', 'data-key': field.key },
      el('option', { value: '' }, 'Not set'), ...field.choices.map((choice) => el('option', { value: choice.value }, choice.label)));
  } else {
    control = el('input', {
      id, class: 'form-control', type: field.type ?? 'text', 'data-key': field.key, autocomplete: field.autocomplete ?? 'off', inputmode: field.inputmode,
    });
  }
  return el('div', { class: `form-group${field.wide ? ' form-group--wide' : ''}` },
    el('label', { for: id, class: 'form-label' }, label), control, field.hint ? el('p', { class: 'hint' }, field.hint) : null);
}

/**
 * The Students workspace: a searchable table of every student, and an editor for the whole record. Editing
 * happens on the server (which validates, logs what changed, and keeps the account in step); this screen
 * only collects the values and shows what the server says.
 */
export function initStudents({
  root = document, store, say, onRecordPayment,
} = {}) {
  const body = root.querySelector('#studentRecordsBody');
  if (!body) return { render() {} };
  const search = root.querySelector('#studentSearch');
  const balanceFilter = root.querySelector('#studentBalanceFilter');
  const status = root.querySelector('#studentRecordsStatus');
  const more = root.querySelector('#studentRecordsMore');

  let shown = PAGE;
  let editing = null; // { uid, saved }
  let dirty = false;

  /* ------------------------------------------------------------ editor dialog */
  const form = el('form', { id: 'studentRecordForm', novalidate: true });
  const formError = el('p', { class: 'form-alert', role: 'alert', 'data-kind': 'error', hidden: true });
  const facts = el('dl', { class: 'record-facts' });
  const paymentsBlock = el('section', { class: 'record-payments', 'aria-label': 'Payments' });
  const fieldNodes = new Map();
  form.append(formError, facts);
  for (const section of SECTIONS) {
    const fieldset = el('fieldset', { class: 'form-section' }, el('legend', {}, section.title));
    const grid = el('div', { class: 'form-grid' });
    for (const field of section.fields) {
      const node = buildField(field);
      fieldNodes.set(field.key, node.querySelector('[data-key]'));
      grid.append(node);
    }
    fieldset.append(grid);
    form.append(fieldset);
  }
  form.append(paymentsBlock);

  const dialogApi = createDialog({
    id: 'studentDialog',
    title: 'Student record',
    wide: true,
    confirmClose: () => !dirty || window.confirm('Discard your changes to this record?'),
  });
  const saveButton = el('button', { type: 'submit', class: 'btn btn-primary', form: 'studentRecordForm' }, 'Save changes');
  const cancelButton = el('button', { type: 'button', class: 'btn btn-outline-secondary' }, 'Cancel');
  dialogApi.body.append(form);
  dialogApi.footer.append(cancelButton, saveButton);
  cancelButton.addEventListener('click', () => { if (!dirty || window.confirm('Discard your changes to this record?')) { dirty = false; dialogApi.close(); } });
  dialogApi.dialog.addEventListener('close', () => { dirty = false; editing = null; });
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', () => { dirty = true; });

  const showFormError = (text) => { formError.textContent = text ?? ''; formError.hidden = !text; };
  const clearErrors = () => { showFormError(''); fieldNodes.forEach((node) => setFieldError(node, null)); };

  function fill(record) {
    for (const key of FIELD_KEYS) {
      const node = fieldNodes.get(key);
      node.value = key === 'feeDueMinor' ? moneyText(record[key]) : record[key] ?? '';
    }
    facts.replaceChildren(
      ...[
        ['Login email', record.email || 'None'],
        ['Account', record.accountStatus],
        ['Application', record.applicationReference || 'None'],
        ['Programmes', store.programmeNames(record.programmeIds).join(', ') || 'Not enrolled'],
      ].flatMap(([term, value]) => [el('dt', {}, term), el('dd', {}, value)]),
    );
    renderPaymentsBlock(record.uid);
  }

  function renderPaymentsBlock(uid) {
    const student = store.studentById(uid);
    const payments = store.paymentsOf(uid);
    const balance = student ? store.balanceOf({ ...student, feeDueMinor: student.feeDueMinor }) : null;
    const rows = payments.slice(0, 6).map((payment) => el('li', {},
      el('span', {}, formatDate(payment.paidAt)),
      el('strong', {}, formatKes(payment.amountMinor)),
      el('span', { class: 'muted' }, `${PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}${payment.reference ? ` · ${payment.reference}` : ''}`),
      payment.status === 'reversed' ? el('span', { class: 'badge-status badge-rejected' }, 'Reversed') : null));
    paymentsBlock.replaceChildren(
      el('div', { class: 'record-payments-head' },
        el('h3', {}, 'Payments'),
        balance ? el('span', { class: 'badge-status', 'data-balance': balance.key }, balance.label) : null,
        el('button', {
          type: 'button', class: 'btn btn-sm btn-outline-secondary', onclick: () => onRecordPayment?.(uid),
        }, 'Record a payment')),
      balance && Number.isInteger(student.feeDueMinor)
        ? el('p', { class: 'muted' }, `Fees agreed ${formatKes(student.feeDueMinor)} · tuition paid ${formatKes(balance.paidMinor)}${balance.balanceMinor > 0 ? ` · ${formatKes(balance.balanceMinor)} to pay` : ''}`)
        : el('p', { class: 'muted' }, 'Set the fees agreed above to see a balance.'),
      rows.length ? el('ul', { class: 'record-payment-list' }, ...rows) : el('p', { class: 'muted' }, 'No payments recorded yet.'),
      payments.length > 6 ? el('p', { class: 'muted' }, `Showing the latest 6 of ${payments.length}. The full list is in Payments.`) : null);
  }

  function collect() {
    const record = {};
    for (const key of FIELD_KEYS) {
      const raw = fieldNodes.get(key).value.trim();
      if (key === 'feeDueMinor') {
        // An unreadable amount is passed on as text, so validation says so instead of it silently becoming "no fee".
        record[key] = raw === '' ? null : parseAmountMinor(raw) ?? raw;
      } else record[key] = raw;
    }
    return record;
  }

  function showErrors(errors) {
    let first = null;
    for (const [key, message] of Object.entries(errors)) {
      const node = fieldNodes.get(key);
      if (!node) continue;
      setFieldError(node, message);
      first ??= node;
    }
    if (first) first.focus();
    else showFormError(Object.values(errors)[0] ?? 'Check the student details.');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editing) return;
    clearErrors();
    const record = collect();
    const checked = validateStudentRecord(record);
    if (!checked.ok) { showErrors(checked.errors); return; }
    setBusy(saveButton, true, 'Saving…');
    try {
      const result = await saveStudentRecord({ uid: editing.uid, record });
      store.replaceStudent(result.record);
      dirty = false;
      dialogApi.close();
      say?.(result.changed?.length ? `Saved ${result.record.displayName}'s record.` : 'Nothing had changed.', 'success');
      (result.warnings ?? []).forEach((warning) => say?.(warning, 'info'));
    } catch (error) {
      if (error.fieldErrors) showErrors(error.fieldErrors);
      else showFormError(error.message || 'That could not be saved. Try again.');
    } finally {
      setBusy(saveButton, false);
    }
  });

  async function open(uid) {
    const known = store.studentById(uid);
    editing = { uid };
    dirty = false;
    clearErrors();
    dialogApi.setTitle(known?.displayName || 'Student record', known?.studentNumber || '');
    saveButton.disabled = true;
    paymentsBlock.replaceChildren(el('p', { class: 'muted' }, 'Loading the record…'));
    dialogApi.open();
    try {
      const { record } = await getStudentRecord(uid);
      if (editing?.uid !== uid) return;
      dialogApi.setTitle(record.displayName || 'Student record', record.studentNumber || '');
      fill(record);
      saveButton.disabled = false;
    } catch (error) {
      showFormError(error.message || 'The record could not be loaded. Close this and try again.');
    }
  }

  /* ------------------------------------------------------------ table */
  const haystack = (student) => [student.displayName, student.email, student.studentNumber, student.phoneNumber, student.applicationReference]
    .filter(Boolean).join(' ').toLowerCase();

  function visibleStudents() {
    const term = (search?.value ?? '').trim().toLowerCase();
    const want = balanceFilter?.value ?? '';
    return store.state.students.filter((student) => {
      if (term && !haystack(student).includes(term)) return false;
      return !want || store.balanceOf(student).key === want;
    });
  }

  function row(student) {
    const balance = store.balanceOf(student);
    const hasFee = Number.isInteger(student.feeDueMinor);
    return el('tr', {},
      el('td', {}, el('strong', {}, student.displayName || 'Unnamed student'), el('br'), el('small', {}, student.email || '')),
      el('td', {}, student.studentNumber || '—'),
      el('td', {}, store.programmeNames(student.programmeIds).join(', ') || '—'),
      el('td', {}, student.phoneNumber || '—'),
      el('td', { class: 'num' }, hasFee ? formatKes(student.feeDueMinor) : '—'),
      el('td', { class: 'num' }, formatKes(balance.paidMinor)),
      el('td', {}, el('span', { class: 'badge-status', 'data-balance': balance.key }, balance.label)),
      el('td', { class: 'actions' }, el('button', {
        type: 'button', class: 'btn btn-sm btn-outline-secondary', 'aria-label': `Open the record for ${student.displayName}`, onclick: () => open(student.uid),
      }, 'Open record')));
  }

  function render() {
    const { students, loaded } = store.state;
    if (!loaded.students) {
      body.replaceChildren(el('tr', {}, el('td', { colspan: 8, class: 'empty' }, 'Loading students…')));
      return;
    }
    const list = visibleStudents();
    if (!students.length) {
      body.replaceChildren(el('tr', {}, el('td', { colspan: 8, class: 'empty' }, 'No students yet. They appear here once an application is approved.')));
    } else if (!list.length) {
      body.replaceChildren(el('tr', {}, el('td', { colspan: 8, class: 'empty' }, 'No student matches that search.')));
    } else {
      body.replaceChildren(...list.slice(0, shown).map(row));
    }
    if (status) {
      const cut = store.state.studentsTruncated ? ' Only the first 1,000 students are loaded.' : '';
      const unready = store.state.loaded.payments ? '' : ' Balances appear once payments have loaded.';
      status.textContent = `${list.length} of ${students.length} students.${cut}${unready}`;
    }
    if (more) {
      more.hidden = list.length <= shown;
      more.textContent = `Show ${Math.min(PAGE, list.length - shown)} more`;
    }
  }

  const rerender = () => { shown = PAGE; render(); };
  search?.addEventListener('input', debounce(rerender, 150));
  balanceFilter?.addEventListener('change', rerender);
  more?.addEventListener('click', () => { shown += PAGE; render(); });
  store.subscribe(() => {
    render();
    if (editing && dialogApi.dialog.open) renderPaymentsBlock(editing.uid);
  });

  return { render, open, close: () => dialogApi.close() };
}
