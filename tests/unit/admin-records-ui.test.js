// @vitest-environment jsdom
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const student = {
  uid: 'u1', displayName: 'Amina Kamau', email: 'a@x.co', studentNumber: 'CFL-2026-00001', phoneNumber: '+254712345678', programmeIds: ['p1'], feeDueMinor: 1000000,
};
const payment = {
  id: 'p_1', studentId: 'u1', amountMinor: 400000, paidAt: new Date('2026-10-01T09:00:00Z'), method: 'mpesa', purpose: 'tuition', reference: 'QWE123', status: 'confirmed',
};
vi.mock('@/services/student-record-service.js', () => ({
  listStudentRecords: vi.fn(async () => ({ students: [student], truncated: false })),
  getStudentRecord: vi.fn(async () => ({ record: { ...student, firstName: 'Amina', surname: 'Kamau', accountStatus: 'active' } })),
  saveStudentRecord: vi.fn(async ({ record }) => ({ record: { ...student, ...record, uid: 'u1', displayName: 'Amina Kamau' }, changed: ['phoneNumber'], warnings: [] })),
}));
vi.mock('@/services/payment-service.js', () => ({
  listPayments: vi.fn(async () => ({ payments: [payment], truncated: false })),
  listPaymentImports: vi.fn(async () => [{ id: 'b1', fileName: 'oct.xlsx', createdAt: new Date(), createdCount: 1, totalMinor: 400000 }]),
  recordPayment: vi.fn(async () => ({ paymentId: 'x' })),
  importPayments: vi.fn(),
  assignPayment: vi.fn(),
  reversePayment: vi.fn(async () => ({ count: 1 })),
  restorePayment: vi.fn(),
}));

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('students and payments screens', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ||= function showModal() { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close ||= function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
    document.body.innerHTML = `
      <input id="studentSearch"><select id="studentBalanceFilter"><option value=""></option></select>
      <p id="studentRecordsStatus"></p><table><tbody id="studentRecordsBody"></tbody></table><button id="studentRecordsMore"></button>
      <span id="tileCollected"></span><span id="tileMonth"></span><span id="tileOutstanding"></span><span id="tileUnassigned"></span>
      <input id="paymentSearch"><select id="paymentFilter"><option value=""></option></select><p id="paymentsTruncated" hidden></p>
      <p id="paymentsStatus"></p><table><tbody id="paymentsBody"></tbody></table><button id="paymentsMore"></button>
      <table><tbody id="importsBody"></tbody></table>
      <button id="importPaymentsBtn"></button><button id="recordPaymentBtn"></button>`;
    window.location.hash = '#payments';
  });

  it('shows the ledger, balances and import history once loaded', async () => {
    const { initRecords } = await import('@/admin/records.js');
    const records = initRecords({ say: vi.fn() });
    records.store.setProgrammes([{ id: 'p1', name: 'English' }]);
    await flush(); await flush();
    expect(document.querySelector('#paymentsBody').textContent).toContain('Amina Kamau');
    expect(document.querySelector('#tileCollected').textContent).toContain('4,000');
    expect(document.querySelector('#tileOutstanding').textContent).toContain('6,000');
    expect(document.querySelector('#importsBody').textContent).toContain('oct.xlsx');
    expect(document.querySelector('#studentRecordsBody').textContent).toContain('Part paid');
    expect(document.querySelector('#studentRecordsBody').textContent).toContain('English');
  });

  it('opens a student record, edits it and saves through the service', async () => {
    const { initRecords } = await import('@/admin/records.js');
    const { saveStudentRecord } = await import('@/services/student-record-service.js');
    initRecords({ say: vi.fn() });
    await flush(); await flush();
    document.querySelector('#studentRecordsBody button').click();
    await flush();
    const phone = document.querySelector('#sr-phoneNumber');
    expect(document.querySelector('#sr-firstName').value).toBe('Amina');
    phone.value = '0722 000 111';
    document.querySelector('#studentRecordForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(saveStudentRecord).toHaveBeenCalled();
  });

  it('refuses to record a payment with no amount', async () => {
    const { initRecords } = await import('@/admin/records.js');
    const { recordPayment } = await import('@/services/payment-service.js');
    initRecords({ say: vi.fn() });
    await flush();
    document.querySelector('#recordPaymentBtn').click();
    document.querySelector('#recordPaymentForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(recordPayment).not.toHaveBeenCalled();
    expect(document.querySelector('#rp-amount').getAttribute('aria-invalid')).toBe('true');
  });
});
