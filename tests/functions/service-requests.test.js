import { describe, expect, it, vi } from 'vitest';
import { adminUpdateServiceRequestCore, submitServiceRequestCore } from '../../functions/src/student-services/requests.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const student = { uid: 'stu1', role: 'student', email: 's@example.test' };
const admin = { uid: 'adm1', role: 'admin' };
const deps = () => {
  const db = fakeDb();
  db.store.set('users/stu1', { displayName: 'Amina Kamau' });
  return { db, FieldValue: fakeFieldValue(), audit: vi.fn() };
};
const submit = (d, over = {}) => submitServiceRequestCore(d, {
  actor: student, data: { requestType: 'transcript', details: 'For a scholarship application, send to the registrar.', ...over },
});

describe('submitting a service request', () => {
  it('stores it for the signed-in student with their name, and logs only the type', async () => {
    const d = deps();
    const result = await submit(d);
    expect(result).toEqual({ requestId: 'auto1', status: 'submitted' });
    expect(d.db.store.get('serviceRequests/auto1')).toMatchObject({
      studentId: 'stu1', studentName: 'Amina Kamau', requestType: 'transcript', status: 'submitted', response: '', reference: '',
    });
    const entry = d.audit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: 'service_request.submit', actorId: 'stu1', metadata: { requestType: 'transcript' } });
    expect(JSON.stringify(entry)).not.toContain('scholarship');
  });

  it('keeps the payment reference only on a payment dispute', async () => {
    const d = deps();
    await submit(d, { requestType: 'payment_dispute', reference: 'QWE123' });
    expect(d.db.store.get('serviceRequests/auto1').reference).toBe('QWE123');
    const e = deps();
    await submit(e, { reference: 'QWE123' });
    expect(e.db.store.get('serviceRequests/auto1').reference).toBe('');
  });

  it('rejects an unknown type or a request with no details', async () => {
    await expect(submit(deps(), { requestType: 'free_money' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(submit(deps(), { details: 'help' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('refuses a second open request of the same kind', async () => {
    const d = deps();
    await submit(d);
    await expect(submit(d)).rejects.toMatchObject({ code: 'already-exists' });
    await expect(submit(d, { requestType: 'academic_support' })).resolves.toBeTruthy();
  });

  it('lets a student ask again once the earlier request is closed', async () => {
    const d = deps();
    await submit(d);
    d.db.store.set('serviceRequests/auto1', { ...d.db.store.get('serviceRequests/auto1'), status: 'completed' });
    await expect(submit(d)).resolves.toBeTruthy();
  });
});

describe('answering a service request', () => {
  const seeded = async () => { const d = deps(); await submit(d); return d; };

  it('records the status, the reply and a history entry', async () => {
    const d = await seeded();
    const now = () => new Date('2026-10-17T10:00:00Z');
    await adminUpdateServiceRequestCore(d, {
      actor: admin, now, data: { requestId: 'auto1', status: 'needs_student', response: 'We need your student number.', nextAction: 'Reply with your student number.' },
    });
    const saved = d.db.store.get('serviceRequests/auto1');
    expect(saved).toMatchObject({ status: 'needs_student', response: 'We need your student number.', nextAction: 'Reply with your student number.', reviewedBy: 'adm1' });
    expect(saved.updates).toHaveLength(1);
    expect(d.audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'service_request.review', metadata: { status: 'needs_student', requestType: 'transcript' } }));
  });

  it('needs a reply to close a request and clears next steps when no longer needed', async () => {
    const d = await seeded();
    await expect(adminUpdateServiceRequestCore(d, { actor: admin, data: { requestId: 'auto1', status: 'completed', response: '' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(adminUpdateServiceRequestCore(d, { actor: admin, data: { requestId: 'auto1', status: 'needs_student', response: 'Please reply.', nextAction: '' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await adminUpdateServiceRequestCore(d, { actor: admin, data: { requestId: 'auto1', status: 'completed', response: 'Sent to the registrar.', nextAction: 'ignored' } });
    expect(d.db.store.get('serviceRequests/auto1').nextAction).toBe('');
  });

  it('cannot move a request back to received, and reports a missing request', async () => {
    const d = await seeded();
    await expect(adminUpdateServiceRequestCore(d, { actor: admin, data: { requestId: 'auto1', status: 'submitted' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(adminUpdateServiceRequestCore(d, { actor: admin, data: { requestId: 'nope', status: 'in_progress' } })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('applying for another programme', () => {
  const apply = (d, over = {}) => submit(d, { requestType: 'new_programme', programmeId: 'english-b2', details: 'I finished level B1 and want to continue.', ...over });

  it('needs a valid programme and stores which one', async () => {
    const d = deps();
    await expect(apply(d, { programmeId: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(apply(d, { programmeId: '../x' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await apply(d);
    expect(d.db.store.get('serviceRequests/auto1')).toMatchObject({ requestType: 'new_programme', programmeId: 'english-b2' });
  });

  it('refuses a programme the student is already in, but allows a different second one', async () => {
    const d = deps();
    d.db.store.set('enrolments/stu1_english-b2', { status: 'active' });
    await expect(apply(d)).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(apply(d, { programmeId: 'french-a1' })).resolves.toBeTruthy();
    await expect(apply(d, { programmeId: 'german-a1' })).resolves.toBeTruthy();
    await expect(apply(d, { programmeId: 'german-a1' })).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('enrols the student only when the admin completes it with enrolment ticked', async () => {
    const d = deps();
    await apply(d);
    await adminUpdateServiceRequestCore(d, { actor: admin, data: { requestId: 'auto1', status: 'in_progress', enrol: true } });
    expect(d.db.store.has('enrolments/stu1_english-b2')).toBe(false);
    const result = await adminUpdateServiceRequestCore(d, {
      actor: admin, data: { requestId: 'auto1', status: 'completed', response: 'Welcome to B2.', enrol: true },
    });
    expect(result.enrolled).toBe(true);
    expect(d.db.store.get('enrolments/stu1_english-b2')).toMatchObject({ studentId: 'stu1', programmeId: 'english-b2', status: 'pending_start' });
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'enrolment.create' }));
  });

  it('does not enrol without the tick, and never overwrites an existing enrolment', async () => {
    const d = deps();
    await apply(d);
    await adminUpdateServiceRequestCore(d, { actor: admin, data: { requestId: 'auto1', status: 'completed', response: 'Noted.' } });
    expect(d.db.store.has('enrolments/stu1_english-b2')).toBe(false);
    d.db.store.set('enrolments/stu1_english-b2', { status: 'active', marker: 'keep' });
    const again = await adminUpdateServiceRequestCore(d, { actor: admin, data: { requestId: 'auto1', status: 'completed', response: 'Done.', enrol: true } });
    expect(again.enrolled).toBe(false);
    expect(d.db.store.get('enrolments/stu1_english-b2').marker).toBe('keep');
  });
});
