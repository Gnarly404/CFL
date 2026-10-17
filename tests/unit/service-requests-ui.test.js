// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mine = [{
  id: 'r1', requestType: 'transcript', status: 'needs_student', details: 'x', response: 'Send your number.', nextAction: 'Reply with your student number.', createdAt: new Date('2026-10-01T09:00:00Z'),
}];
vi.mock('@/services/service-request-service.js', () => ({
  listMyServiceRequests: vi.fn(async () => mine),
  submitServiceRequest: vi.fn(async () => ({ requestId: 'r2' })),
  listServiceRequests: vi.fn(async () => [{ ...mine[0], studentName: 'Amina Kamau', studentEmail: 'a@x.co', updates: [] }]),
  updateServiceRequest: vi.fn(async () => ({})),
}));
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('student requests', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ||= function showModal() { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close ||= function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
    document.body.innerHTML = `<button data-service-request="transcript"></button><button data-service-request="payment_dispute"></button>
      <div id="serviceRequestList"></div>
      <select id="serviceRequestFilter"><option value="open"></option></select><p id="serviceRequestsStatus"></p><table><tbody id="serviceRequestsBody"></tbody></table>`;
  });

  it('shows the Centre reply and disables a kind that is already open', async () => {
    const { initServiceRequests } = await import('@/student/service-requests.js');
    initServiceRequests({ uid: 'u1' });
    await flush();
    const text = document.querySelector('#serviceRequestList').textContent;
    expect(text).toContain('Send your number.');
    expect(text).toContain('Reply with your student number.');
    expect(document.querySelector('[data-service-request="transcript"]').disabled).toBe(true);
    expect(document.querySelector('[data-service-request="payment_dispute"]').disabled).toBe(false);
  });

  it('will not send a request without details, then sends a valid one', async () => {
    const { initServiceRequests } = await import('@/student/service-requests.js');
    const { submitServiceRequest } = await import('@/services/service-request-service.js');
    initServiceRequests({ uid: 'u1' });
    await flush();
    document.querySelector('[data-service-request="payment_dispute"]').click();
    document.querySelector('#serviceRequestForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(submitServiceRequest).not.toHaveBeenCalled();
    document.querySelector('#serviceRequestDetails').value = 'I was charged twice for October tuition.';
    document.querySelector('#serviceRequestForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(submitServiceRequest).toHaveBeenCalledWith(expect.objectContaining({ requestType: 'payment_dispute' }));
  });

  it('asks which programme for a new-programme request, hiding ones already joined', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button data-service-request="new_programme"></button>');
    const { initServiceRequests } = await import('@/student/service-requests.js');
    const { submitServiceRequest } = await import('@/services/service-request-service.js');
    initServiceRequests({
      uid: 'u1',
      loadProgrammes: async () => [{ id: 'english-b1', name: 'English B1' }, { id: 'french-a1', name: 'French A1' }],
      enrolledIds: ['english-b1'],
    });
    await flush();
    document.querySelector('[data-service-request="new_programme"]').click();
    expect([...document.querySelectorAll('#serviceRequestProgramme option')].map((o) => o.textContent)).toEqual(['Choose a programme…', 'French A1']);
    document.querySelector('#serviceRequestDetails').value = 'I want to start French next term.';
    document.querySelector('#serviceRequestForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(submitServiceRequest).not.toHaveBeenCalledWith(expect.objectContaining({ requestType: 'new_programme' }));
    document.querySelector('#serviceRequestProgramme').value = 'french-a1';
    document.querySelector('#serviceRequestForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(submitServiceRequest).toHaveBeenCalledWith(expect.objectContaining({ requestType: 'new_programme', programmeId: 'french-a1' }));
  });

  it('lets an admin open a request and answer it', async () => {
    const { initServiceRequests } = await import('@/admin/service-requests.js');
    const { updateServiceRequest } = await import('@/services/service-request-service.js');
    const ui = initServiceRequests({ say: vi.fn() });
    await ui.load();
    expect(document.querySelector('#serviceRequestsBody').textContent).toContain('Amina Kamau');
    document.querySelector('#serviceRequestsBody button').click();
    document.querySelector('#srv-status').value = 'completed';
    document.querySelector('#srv-response').value = 'Sent to the registrar.';
    document.querySelector('#serviceReviewForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(updateServiceRequest).toHaveBeenCalledWith({
      requestId: 'r1', status: 'completed', response: 'Sent to the registrar.', nextAction: '', enrol: false,
    });
  });
});
