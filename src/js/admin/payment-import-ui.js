import { el, setBusy } from '@/utils/dom.js';
import {
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_PURPOSES, PAYMENT_PURPOSE_LABELS, formatKes,
} from '@/utils/payment-schema.js';
import { formatDate } from '@/utils/format.js';
import { importPayments } from '@/services/payment-service.js';
import {
  IMPORT_FIELDS, ImportFileError, MAX_FILE_BYTES, autoMap, buildCandidates, readSpreadsheetFile, tally, toTable,
} from '@/payments/import-parse.js';
import { buildStudentIndex, matchPayment } from '@/payments/match.js';
import { alreadyRecorded, existingKeys } from '@/payments/ledger.js';
import { createDialog } from './dialog.js';
import { studentInput } from './student-picker.js';

const CHUNK = 500;
const SHOWN = 100;
const TIER_LABELS = {
  sure: 'Matched', likely: 'Check', ambiguous: 'Choose', none: 'No match',
};
const newBatchId = () => (globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

/**
 * Import a bank or M-Pesa statement. The browser reads the file, works out which student each row belongs
 * to, and shows all of it for the admin to correct before anything is saved. Nothing is sent until "Import".
 * Only rows with unambiguous evidence are filled in for the admin; the rest are left for them to choose.
 */
export function initPaymentImport({
  root = document, store, options, say, onDone,
} = {}) {
  const trigger = root.querySelector('#importPaymentsBtn');
  if (!trigger) return { open() {} };

  const state = {
    file: null, table: null, mapping: null, method: '', purpose: 'tuition', rows: [], filter: 'all', shown: SHOWN, sending: false,
  };
  const dialogApi = createDialog({
    id: 'importDialog',
    title: 'Import payments',
    eyebrow: 'From a bank or M-Pesa statement',
    wide: true,
    confirmClose: () => !state.rows.length || state.done || window.confirm('Leave without importing? Nothing has been saved yet.'),
  });
  const { body, footer } = dialogApi;
  dialogApi.dialog.classList.add('console-dialog--import');

  const pick = el('input', { type: 'file', id: 'importFile', class: 'visually-hidden', accept: '.csv,.tsv,.txt,.xlsx' });
  const message = el('p', { class: 'form-alert', role: 'alert', 'data-kind': 'error', hidden: true });
  const stage = el('div', { class: 'import-stage' });
  const importButton = el('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Import');
  const closeButton = el('button', { type: 'button', class: 'btn btn-outline-secondary' }, 'Cancel');
  footer.append(closeButton, importButton);
  body.append(message, stage);
  closeButton.addEventListener('click', () => { if (state.done || !state.rows.length || window.confirm('Leave without importing? Nothing has been saved yet.')) { state.done = true; dialogApi.close(); } });

  const fail = (text) => { message.textContent = text ?? ''; message.hidden = !text; };
  const selectFrom = (values, labels, current, blank) => {
    const node = el('select', { class: 'form-select form-select-sm' }, blank ? el('option', { value: '' }, blank) : null,
      ...values.map((value) => el('option', { value }, labels[value])));
    node.value = current;
    return node;
  };

  /* ------------------------------------------------------------ step 1: choose a file */
  function showPicker() {
    state.file = null; state.rows = []; state.done = false;
    importButton.hidden = true;
    closeButton.textContent = 'Cancel';
    fail('');
    const label = el('label', { for: 'importFile', class: 'btn btn-primary' }, 'Choose a file');
    stage.replaceChildren(
      el('p', {}, 'Choose an Excel (.xlsx) or CSV statement. The columns are recognised from their headings, and you can correct them on the next screen.'),
      el('p', { class: 'muted' }, `Up to ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. Old .xls files must be saved as .xlsx or CSV first. Rows already in the ledger are recognised and skipped.`),
      label, pick);
  }

  pick.addEventListener('change', async () => {
    const [file] = pick.files;
    pick.value = '';
    if (!file) return;
    fail('');
    stage.replaceChildren(el('p', { class: 'muted' }, `Reading ${file.name}…`));
    try {
      const data = await readSpreadsheetFile(file);
      state.file = file;
      state.table = toTable(data);
      state.mapping = autoMap(state.table.headers);
      state.method = ''; state.purpose = 'tuition'; state.filter = 'all'; state.shown = SHOWN;
      rebuild();
    } catch (error) {
      showPicker();
      fail(error instanceof ImportFileError ? error.message : 'That file could not be read. Check that it is a spreadsheet and try again.');
    }
  });

  /* ------------------------------------------------------------ step 2: review */
  const studentIndex = () => buildStudentIndex(store.state.students);
  /** Re-reads the rows with the chosen columns, method and purpose, keeping the admin's choices where the row is unchanged. */
  function rebuild() {
    const keys = existingKeys(store.state.payments);
    const index = studentIndex();
    const before = new Map(state.rows.map((row) => [row.rowNumber, row]));
    state.rows = buildCandidates(state.table, state.mapping, { method: state.method, purpose: state.purpose }).map((candidate) => {
      const prior = before.get(candidate.rowNumber);
      const match = matchPayment(candidate, index);
      const known = candidate.status === 'ready' ? alreadyRecorded(candidate, keys) : '';
      return {
        ...candidate,
        match,
        known,
        studentId: prior ? prior.studentId : match.studentId,
        touched: prior?.touched ?? false,
        include: prior ? prior.include : candidate.status === 'ready' && !candidate.duplicate && !known,
        // Rows already in the ledger or repeated in the file are never sent by default
      };
    });
    renderReview();
  }

  const usable = (row) => row.status === 'ready' && !row.known && !row.duplicate;
  const chosen = () => state.rows.filter((row) => row.include && usable(row));

  function updateFooter() {
    const sending = chosen();
    const methodMissing = sending.some((row) => !row.method);
    const total = sending.reduce((sum, row) => sum + row.amountMinor, 0);
    importButton.hidden = false;
    importButton.disabled = state.sending || !sending.length || methodMissing;
    importButton.textContent = sending.length ? `Import ${sending.length} payment${sending.length === 1 ? '' : 's'} (${formatKes(total)})` : 'Nothing to import';
    importButton.title = methodMissing ? 'Choose how these were paid first.' : '';
  }

  function summaryChips() {
    const counts = tally(state.rows);
    const unassigned = chosen().filter((row) => !row.studentId).length;
    const chip = (text, kind = '') => el('span', { class: `chip${kind ? ` chip--${kind}` : ''}` }, text);
    const already = state.rows.filter((row) => row.known).length;
    return el('div', { class: 'import-chips' },
      chip(`${counts.total} rows`),
      chip(`${chosen().length} to import`, 'good'),
      already ? chip(`${already} already recorded`) : null,
      counts.duplicates ? chip(`${counts.duplicates} repeated in the file`, 'warn') : null,
      counts.skipped ? chip(`${counts.skipped} money out`) : null,
      counts.errors ? chip(`${counts.errors} with problems`, 'bad') : null,
      unassigned ? chip(`${unassigned} without a student`, 'warn') : null);
  }

  function mappingControls() {
    const wrap = el('details', { class: 'import-mapping', open: !state.table.headerFound || state.mapping.date < 0 || state.mapping.amount < 0 },
      el('summary', {}, 'Columns'));
    const grid = el('div', { class: 'form-grid' });
    IMPORT_FIELDS.forEach((fieldDef) => {
      const node = el('select', { class: 'form-select form-select-sm', id: `map-${fieldDef.key}` },
        el('option', { value: '-1' }, fieldDef.required ? 'Choose a column…' : 'Not in this file'),
        ...state.table.headers.map((header, i) => el('option', { value: String(i) }, header)));
      node.value = String(state.mapping[fieldDef.key]);
      node.addEventListener('change', () => { state.mapping[fieldDef.key] = Number(node.value); rebuild(); });
      grid.append(el('div', { class: 'form-group' }, el('label', { for: node.id, class: 'form-label' }, `${fieldDef.label}${fieldDef.required ? ' *' : ''}`), node));
    });
    wrap.append(grid);
    return wrap;
  }

  function settings() {
    const method = selectFrom(PAYMENT_METHODS, PAYMENT_METHOD_LABELS, state.method, 'Choose…');
    method.id = 'importMethod';
    const purpose = selectFrom(PAYMENT_PURPOSES, PAYMENT_PURPOSE_LABELS, state.purpose);
    purpose.id = 'importPurpose';
    method.addEventListener('change', () => { state.method = method.value; rebuild(); });
    purpose.addEventListener('change', () => { state.purpose = purpose.value; rebuild(); });
    const needMethod = state.rows.some((row) => row.needsMethod && !row.method);
    return el('div', { class: 'form-grid import-settings' },
      el('div', { class: 'form-group' }, el('label', { for: 'importMethod', class: 'form-label' }, 'Paid by (when a row does not say)'), method,
        needMethod ? el('p', { class: 'hint hint--warn' }, 'Some rows do not say how they were paid. Choose one to continue.') : null),
      el('div', { class: 'form-group' }, el('label', { for: 'importPurpose', class: 'form-label' }, 'These payments are for'), purpose));
  }

  const filters = [
    ['all', 'All rows'], ['import', 'To import'], ['attention', 'Needs a student'], ['skipped', 'Not imported'],
  ];
  const passes = (row) => {
    if (state.filter === 'import') return row.include && usable(row);
    if (state.filter === 'attention') return usable(row) && !row.studentId;
    if (state.filter === 'skipped') return !usable(row) || !row.include;
    return true;
  };

  function previewRow(row) {
    const ok = usable(row);
    const check = el('input', {
      type: 'checkbox', checked: row.include && ok, disabled: !ok, 'aria-label': `Import row ${row.rowNumber}`,
    });
    check.addEventListener('change', () => { row.include = check.checked; refreshChrome(); });
    const note = row.status === 'error' ? row.reason
      : row.status === 'skipped' ? row.reason
        : row.known === 'reversed' ? 'Already in the ledger as a reversed payment. Restore it there instead.'
          : row.known ? 'Already recorded'
            : row.duplicate ? 'Repeated in this file' : '';
    let student = el('span', { class: 'muted' }, '—');
    if (ok) {
      const box = studentInput(options, { id: `st-${row.rowNumber}`, value: row.studentId, label: `Student for row ${row.rowNumber}` });
      const badge = el('span', { class: `tier tier--${row.studentId === row.match.studentId ? row.match.tier : 'chosen'}` },
        row.studentId === row.match.studentId ? TIER_LABELS[row.match.tier] : row.studentId ? 'Chosen' : 'Unassigned');
      box.addEventListener('change', () => {
        const uid = options.resolve(box.value);
        if (uid === undefined) return;
        row.studentId = uid; row.touched = true;
        badge.className = `tier tier--${uid === row.match.studentId ? row.match.tier : 'chosen'}`;
        badge.textContent = uid === row.match.studentId ? TIER_LABELS[row.match.tier] : uid ? 'Chosen' : 'Unassigned';
        refreshChrome();
      });
      student = el('div', { class: 'import-student' }, box, badge,
        row.match.reason ? el('small', {}, row.match.reason) : null);
    }
    return el('tr', { class: ok ? '' : 'is-muted' },
      el('td', {}, check),
      el('td', {}, String(row.rowNumber)),
      el('td', {}, row.paidAt ? formatDate(row.paidAt) : '—'),
      el('td', { class: 'num' }, Number.isInteger(row.amountMinor) ? formatKes(row.amountMinor) : '—'),
      el('td', {}, row.payerName || row.payerPhone || '—', row.reference ? el('br') : null, row.reference ? el('small', {}, row.reference) : null),
      el('td', {}, student),
      el('td', {}, note || (row.method ? PAYMENT_METHOD_LABELS[row.method] : '')));
  }

  let chipsSlot; let tableBody; let moreButton;
  function refreshChrome() {
    chipsSlot.replaceChildren(summaryChips());
    updateFooter();
  }
  function renderRows() {
    const list = state.rows.filter(passes);
    tableBody.replaceChildren(...(list.length ? list.slice(0, state.shown).map(previewRow)
      : [el('tr', {}, el('td', { colspan: 7, class: 'empty' }, 'No rows here.'))]));
    moreButton.hidden = list.length <= state.shown;
    moreButton.textContent = `Show ${Math.min(SHOWN, list.length - state.shown)} more`;
  }

  function renderReview() {
    closeButton.textContent = 'Cancel';
    chipsSlot = el('div');
    tableBody = el('tbody');
    moreButton = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary' });
    moreButton.addEventListener('click', () => { state.shown += SHOWN; renderRows(); });
    const filterBar = el('div', { class: 'import-filters', role: 'group', 'aria-label': 'Show rows' },
      ...filters.map(([key, text]) => {
        const button = el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', 'aria-pressed': String(state.filter === key) }, text);
        button.addEventListener('click', () => { state.filter = key; state.shown = SHOWN; renderReview(); });
        return button;
      }));
    const fileLine = el('p', { class: 'muted' }, `${state.file.name} · `, el('button', { type: 'button', class: 'link-button' }, 'Choose a different file'));
    fileLine.querySelector('button').addEventListener('click', () => showPicker());
    const needsColumns = state.mapping.date < 0 || state.mapping.amount < 0;
    stage.replaceChildren(
      fileLine, mappingControls(), settings(),
      needsColumns ? el('p', { class: 'form-alert', role: 'alert', 'data-kind': 'error' }, 'Choose the date and amount columns above to see the payments.') : null,
      chipsSlot, filterBar,
      el('div', { class: 'table-scroll' }, el('table', { class: 'data-table import-table' },
        el('thead', {}, el('tr', {}, ...['', 'Row', 'Date', 'Amount', 'Payer', 'Student', 'Note'].map((text) => el('th', { scope: 'col' }, text)))),
        tableBody)),
      moreButton,
      el('p', { class: 'muted' }, 'Rows marked "Check" or "Choose" are guesses or have several possible students. Change them before importing. Payments without a student are saved as unassigned and can be given to a student later.'));
    renderRows();
    refreshChrome();
  }

  /* ------------------------------------------------------------ step 3: send and report */
  function showResult(result, batchId) {
    state.done = true;
    importButton.hidden = true;
    closeButton.textContent = 'Close';
    const problems = result.problems.map((p) => el('li', {}, `Row ${p.row}: ${p.message}`));
    stage.replaceChildren(
      el('h3', {}, `${result.created} payment${result.created === 1 ? '' : 's'} imported`),
      el('p', {}, `${formatKes(result.createdMinor)} added to the ledger.`),
      result.duplicates ? el('p', { class: 'muted' }, `${result.duplicates} were already in the ledger and were skipped.`) : null,
      result.problemCount ? el('div', {},
        el('p', { class: 'form-alert', 'data-kind': 'error' }, `${result.problemCount} row${result.problemCount === 1 ? '' : 's'} could not be saved.`),
        el('ul', {}, ...problems),
        result.problemCount > problems.length ? el('p', { class: 'muted' }, `…and ${result.problemCount - problems.length} more.`) : null) : null,
      el('p', { class: 'muted' }, `If this was the wrong file, use "Reverse import" in the import history. Reference: ${batchId}`));
  }

  importButton.addEventListener('click', async () => {
    const rows = chosen();
    if (!rows.length || state.sending) return;
    state.sending = true;
    fail('');
    setBusy(importButton, true, 'Importing…');
    const batchId = newBatchId();
    const total = {
      created: 0, duplicates: 0, createdMinor: 0, problems: [], problemCount: 0,
    };
    try {
      for (let start = 0; start < rows.length; start += CHUNK) {
        const slice = rows.slice(start, start + CHUNK).map((row) => ({
          rowNumber: row.rowNumber,
          studentId: row.studentId || '',
          amountMinor: row.amountMinor,
          paidAt: row.paidAt,
          method: row.method,
          purpose: row.purpose,
          reference: row.reference,
          payerName: row.payerName,
          payerPhone: row.payerPhone,
          note: row.note,
        }));
        // chunks go one after another so a failure stops the rest
        const result = await importPayments({ batchId, fileName: state.file.name, rows: slice });
        total.created += result.created; total.duplicates += result.duplicates; total.createdMinor += result.createdMinor;
        total.problemCount += result.problemCount; total.problems.push(...result.problems);
      }
      showResult(total, batchId);
      say?.(`Imported ${total.created} payment${total.created === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      // Earlier chunks may have been saved. Re-importing the same file is safe: saved rows are recognised and skipped.
      fail(`${error.message || 'The import was interrupted.'}${total.created ? ` ${total.created} payments were saved before it stopped. Import the same file again to finish: payments already saved are skipped.` : ''}`);
    } finally {
      state.sending = false;
      setBusy(importButton, false);
      await onDone?.();
    }
  });

  function open() {
    showPicker();
    dialogApi.open();
  }
  trigger.addEventListener('click', open);
  dialogApi.dialog.addEventListener('close', () => { state.rows = []; state.file = null; });
  return { open };
}
