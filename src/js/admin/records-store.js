import { listStudentRecords } from '@/services/student-record-service.js';
import { listPaymentImports, listPayments } from '@/services/payment-service.js';
import { ledgerSummary, studentBalance, totalsByStudent } from '@/payments/ledger.js';

/**
 * The data the Students and Payments screens share: who the students are and what has been paid. Both
 * screens subscribe, so recording a payment updates the balance shown on the student's row without either
 * screen knowing about the other.
 */
export function createRecordsStore() {
  const state = {
    students: [],
    payments: [],
    imports: [],
    programmes: new Map(),
    studentsTruncated: false,
    paymentsTruncated: false,
    loaded: { students: false, payments: false, imports: false },
  };
  const listeners = new Set();
  let totals = new Map();
  const emit = () => listeners.forEach((listener) => listener(state));

  const store = {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async loadStudents() {
      const { students, truncated } = await listStudentRecords();
      state.students = students;
      state.studentsTruncated = Boolean(truncated);
      state.loaded.students = true;
      emit();
    },
    async loadPayments() {
      const { payments, truncated } = await listPayments();
      state.payments = payments;
      state.paymentsTruncated = truncated;
      state.loaded.payments = true;
      totals = totalsByStudent(payments);
      emit();
    },
    async loadImports() {
      state.imports = await listPaymentImports();
      state.loaded.imports = true;
      emit();
    },
    /** A saved record replaces its row in the list, so the table updates without another round trip. */
    replaceStudent(record) {
      const copy = { ...record, hasIdentification: Boolean(record.identificationNumber) };
      delete copy.identificationNumber;
      delete copy.identificationType;
      const at = state.students.findIndex((student) => student.uid === record.uid);
      if (at >= 0) state.students = state.students.map((student, i) => (i === at ? { ...student, ...copy } : student));
      emit();
    },
    setProgrammes(rows) {
      state.programmes = new Map(rows.map((programme) => [programme.id, programme.name]));
      emit();
    },
    programmeNames: (ids = []) => ids.map((id) => state.programmes.get(id) ?? id),
    studentById: (uid) => state.students.find((student) => student.uid === uid) ?? null,
    balanceOf: (student) => studentBalance(student, totals),
    paymentsOf: (uid) => state.payments.filter((payment) => payment.studentId === uid),
    summary: (now = new Date()) => ledgerSummary(state.payments, state.students, now),
  };
  return store;
}
