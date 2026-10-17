import { createRecordsStore } from './records-store.js';
import { createStudentOptions } from './student-picker.js';
import { initStudents } from './students.js';
import { initPayments } from './payments.js';
import { initPaymentImport } from './payment-import-ui.js';
import { workspaceFor } from './console.js';

/**
 * Wires the Students and Payments workspaces to one shared store. The data is fetched the first time one of
 * those workspaces is opened, so an admin who only reviews applications never pays for reading the ledger.
 */
export function initRecords({ root = document, win = window, say } = {}) {
  const store = createRecordsStore();
  const options = createStudentOptions();
  store.subscribe((state) => options.update(state.students));

  const students = initStudents({
    root, store, say, onRecordPayment: (uid) => { students.close?.(); payments.openRecord(uid); },
  });
  const payments = initPayments({
    root, store, options, say,
  });
  const imports = initPaymentImport({
    root, store, options, say, onDone: () => payments.refresh(),
  });

  const loads = new Map();
  const fail = (what) => (error) => say?.(error?.message || `The ${what} could not be loaded. Use Refresh to try again.`, 'error');
  const once = (key, load) => {
    if (!loads.has(key)) loads.set(key, load().catch((error) => { loads.delete(key); fail(key)(error); }));
    return loads.get(key);
  };
  const ensure = (name) => {
    if (name === 'students') { once('students', store.loadStudents); once('payments', store.loadPayments); }
    if (name === 'payments') { once('students', store.loadStudents); once('payments', store.loadPayments); once('imports', store.loadImports); }
  };
  const current = () => {
    let id = '';
    try { id = decodeURIComponent(win.location.hash.slice(1)); } catch { /* an unreadable hash is just no hash */ }
    return workspaceFor(id);
  };
  win.addEventListener('hashchange', () => ensure(current()));
  ensure(current());

  /** Reloads whatever has been opened so far. */
  const reload = () => {
    const wanted = [...loads.keys()];
    loads.clear();
    return Promise.all(wanted.map((key) => once(key, key === 'students' ? store.loadStudents : key === 'payments' ? store.loadPayments : store.loadImports)));
  };

  return {
    store, students, payments, imports, ensure, reload,
  };
}
