import { describe, expect, it, vi } from 'vitest';
import {
  adminDeletePrivacyRequestCore, adminReviewPrivacyRequestCore, submitPrivacyRequestCore,
} from '../../functions/src/privacy/requests.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const student = { uid: 'stu1', role: 'student', email: 'student@example.test' };
const admin = { uid: 'adm1', role: 'admin' };

function deps() {
  return { db: fakeDb(), FieldValue: fakeFieldValue(), audit: vi.fn() };
}

describe('student privacy requests', () => {
  it('stores a data-access request for the authenticated student', async () => {
    const d = deps();
    const result = await submitPrivacyRequestCore(d, { actor: student, data: { requestType: 'data_access', details: '' } });
    expect(result).toEqual({ requestId: 'auto1', status: 'submitted' });
    expect(d.db.store.get('privacyRequests/auto1')).toMatchObject({
      studentId: 'stu1', studentEmail: 'student@example.test', requestType: 'data_access', status: 'submitted',
      response: '', nextAction: '', details: '', createdAt: 'SERVER_TS',
    });
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'privacy_request.submit', actorId: 'stu1' }));
  });

  it('stores correction category and details without changing student records', async () => {
    const d = deps();
    await submitPrivacyRequestCore(d, {
      actor: student,
      data: { requestType: 'correction', correctionCategory: 'legal_identity', details: 'Please correct my surname.' },
    });
    expect(d.db.store.get('privacyRequests/auto1')).toMatchObject({
      requestType: 'correction', correctionCategory: 'legal_identity', details: 'Please correct my surname.', status: 'submitted',
    });
    expect(d.db.store.has('students/stu1')).toBe(false);
  });

  it('validates request type, correction category, and request details', async () => {
    await expect(submitPrivacyRequestCore(deps(), { actor: student, data: { requestType: 'erase_everything' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(submitPrivacyRequestCore(deps(), { actor: student, data: { requestType: 'correction', details: 'Please fix this.' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(submitPrivacyRequestCore(deps(), { actor: student, data: { requestType: 'objection', details: 'No' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('records staff decisions and student actions but does not execute them', async () => {
    const d = deps();
    d.db.store.set('privacyRequests/r1', { studentId: 'stu1', status: 'submitted', updates: [] });
    const result = await adminReviewPrivacyRequestCore(d, {
      actor: admin,
      data: { requestId: 'r1', status: 'needs_student', response: 'Please send a verified document.', nextAction: 'Reply with proof of your legal name.' },
      now: () => new Date('2026-10-12T10:00:00.000Z'),
    });
    expect(result).toEqual({ requestId: 'r1', status: 'needs_student' });
    expect(d.db.store.get('privacyRequests/r1')).toMatchObject({
      status: 'needs_student', response: 'Please send a verified document.', nextAction: 'Reply with proof of your legal name.',
      updates: [{ reviewedBy: 'adm1', reviewedAt: '2026-10-12T10:00:00.000Z' }],
    });
    expect(d.db.store.has('students/stu1')).toBe(false);
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'privacy_request.review', actorId: 'adm1' }));
  });

  it('requires staff response and next action where applicable', async () => {
    const d = deps();
    d.db.store.set('privacyRequests/r1', { studentId: 'stu1', status: 'submitted', updates: [] });
    await expect(adminReviewPrivacyRequestCore(d, { actor: admin, data: { requestId: 'r1', status: 'completed', response: '' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(adminReviewPrivacyRequestCore(d, { actor: admin, data: { requestId: 'r1', status: 'needs_student', response: 'Please reply.' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(adminReviewPrivacyRequestCore(d, { actor: admin, data: { requestId: 'missing', status: 'under_review' } }))
      .rejects.toMatchObject({ code: 'not-found' });
  });

  it('permanently deletes declined requests and audits without retaining details', async () => {
    const d = deps();
    d.db.store.set('privacyRequests/r1', { status: 'declined', requestType: 'deletion', details: 'Private details' });
    await expect(adminDeletePrivacyRequestCore(d, { actor: admin, data: { requestId: 'r1' } }))
      .resolves.toEqual({ requestId: 'r1', deleted: true });
    expect(d.db.store.has('privacyRequests/r1')).toBe(false);
    expect(d.audit).toHaveBeenCalledWith({
      actorId: 'adm1', action: 'privacy_request.delete', resource: { type: 'privacyRequest', id: 'r1' },
      metadata: { requestType: 'deletion', previousStatus: 'declined' },
    });
    expect(JSON.stringify(d.audit.mock.calls)).not.toContain('Private details');
  });

  it('refuses permanent deletion when a privacy request is not declined', async () => {
    const d = deps();
    d.db.store.set('privacyRequests/r1', { status: 'under_review', requestType: 'objection' });
    await expect(adminDeletePrivacyRequestCore(d, { actor: admin, data: { requestId: 'r1' } }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(d.db.store.has('privacyRequests/r1')).toBe(true);
  });
});