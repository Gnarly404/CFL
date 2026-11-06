import { File as NodeFile } from 'node:buffer';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

// The dialog is the only place that joins reading a file to building the review table, and the parser tests
// never touched it: a mismatch between the two (the dialog passed the whole read result where the table builder
// wanted its rows) made every import fail with "That file could not be read". This drives the real dialog.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/' });
for (const key of ['window', 'document', 'Node', 'HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'Event', 'CustomEvent',
  'DocumentFragment', 'Element', 'MutationObserver', 'KeyboardEvent']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], configurable: true, writable: true });
}
dom.window.confirm = () => true;
dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };

const students = [{
  uid: 'uid-1', studentNumber: 'CFL-0001', firstName: 'Wanjiku', surname: 'Mwangi', middleName: '', displayName: 'Wanjiku Mwangi', phoneNumber: '', contactPhone: '',
}];

async function openWith(file, { drop = false } = {}) {
  const { initPaymentImport } = await import('@/admin/payment-import-ui.js');
  const { createRecordsStore } = await import('@/admin/records-store.js');
  const { createStudentOptions } = await import('@/admin/student-picker.js');
  document.body.innerHTML = '<button id="importPaymentsBtn">Import</button>';
  const store = createRecordsStore();
  store.state.students = students;
  const options = createStudentOptions();
  options.update(students);
  initPaymentImport({ root: document, store, options, say() {}, onDone() {} });
  document.querySelector('#importPaymentsBtn').click();
  const pick = document.querySelector('#importFile');
  if (drop) {
    const dropzone = document.querySelector('.import-dropzone');
    dropzone.dispatchEvent(new dom.window.Event('dragenter', { bubbles: true, cancelable: true }));
    expect(dropzone.classList.contains('is-dragging')).toBe(true);
    const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    dropzone.dispatchEvent(event);
    expect(dropzone.classList.contains('is-dragging')).toBe(false);
  } else {
    Object.defineProperty(pick, 'files', { value: [file], configurable: true });
    pick.dispatchEvent(new dom.window.Event('change'));
  }
}

describe('import dialog', () => {
  it('shows the review table for a CSV statement', async () => {
    const csv = 'Date paid,Receipt No,Student number,Amount received,Payment method\n2026-09-02,SKB4N7Q2LM,CFL-0001,20000,M-Pesa\n';
    await openWith(new NodeFile([csv], 'payments.csv'), { drop: true });
    await vi.waitFor(() => expect(document.querySelectorAll('.import-table tbody tr')).toHaveLength(1), { timeout: 3000 });
    expect(document.querySelector('p.form-alert[role="alert"]').hidden).toBe(true);
    expect(document.body.textContent).toContain('Import 1 payment');
    expect(document.querySelector('.import-table .tier').textContent).toBe('Matched');
  });

  it('says why when the file is not a spreadsheet', async () => {
    await openWith(new NodeFile(['nothing'], 'notes.pdf'));
    await vi.waitFor(() => expect(document.querySelector('p.form-alert[role="alert"]').hidden).toBe(false), { timeout: 3000 });
    expect(document.querySelector('p.form-alert[role="alert"]').textContent).toBe('Choose an .xlsx or .csv file.');
  });
});
