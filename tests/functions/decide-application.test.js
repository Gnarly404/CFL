import { describe, expect, it, vi } from 'vitest';
import { decideApplicationCore } from '../../functions/src/applications/decide.js';
import {
  fakeDb, fakeFieldValue, fakeMailer, fakeRepo, log,
} from './helpers/fakes.js';

const application = {
  id: 'app1', reference: 'CFL-2026-00001', email: 'parent@example.com', status: 'submitted', programmeId: 'general-english', userId: null,
  applicant: {
    firstName: 'Wanjiku', middleName: '', surname: 'Kamau', dateOfBirth: '2012-05-14', gender: 'female', phoneNumber: '+254712345678', nationality: 'kenyan',
  },
  guardian: { name: 'Grace Kamau', relationship: 'parent', phoneNumber: '+254722000111', emergencyContact: 'Peter Kamau' },
};
const actor = { uid: 'admin1', role: 'admin' };

function deps(overrides = {}) {
  return {
    repo: fakeRepo([application]),
    audit: vi.fn(),
    provision: vi.fn(async () => ({ uid: 'student1', invited: true, activationUrl: 'https://cfl.test/activate?x' })),
    mailer: fakeMailer(),
    baseUrl: 'https://cfl.test',
    db: fakeDb(),
    FieldValue: fakeFieldValue(),
    log: log(),
    ...overrides,
  };
}
const decide = (d, data) => decideApplicationCore(d, { actor, data });

describe('decideApplication', () => {
  it('approval creates the student account, enrols them and records the decision', async () => {
    const d = deps();
    const result = await decide(d, { applicationId: 'app1', decision: 'approve' });
    expect(result).toEqual({ status: 'approved', userId: 'student1' });
    expect(d.provision).toHaveBeenCalledWith(expect.objectContaining({
      email: 'parent@example.com', displayName: 'Wanjiku Kamau', role: 'student', createdBy: 'admin1', applicationId: 'app1',
      profile: expect.objectContaining({ applicationReference: 'CFL-2026-00001', guardian: application.guardian }),
    }));
    expect(d.db.store.get('enrolments/student1_general-english')).toMatchObject({ studentId: 'student1', status: 'pending_start' });
    expect(d.repo.applyDecision).toHaveBeenCalledWith('app1', expect.objectContaining({ status: 'approved', by: 'admin1', userId: 'student1' }));
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'application.approve', resource: { type: 'application', id: 'app1' } }));
  });

  it('does not enrol anyone when no programme was chosen', async () => {
    const d = deps({ repo: fakeRepo([{ ...application, programmeId: null }]) });
    await decide(d, { applicationId: 'app1', decision: 'approve' });
    expect([...d.db.store.keys()].filter((key) => key.startsWith('enrolments/'))).toEqual([]);
  });

  it('declining notifies the applicant and creates no account', async () => {
    const d = deps();
    const result = await decide(d, { applicationId: 'app1', decision: 'reject' });
    expect(result.status).toBe('rejected');
    expect(d.provision).not.toHaveBeenCalled();
    expect(d.mailer.sent[0]).toMatchObject({ to: 'parent@example.com' });
    expect(d.mailer.sent[0].subject).toContain('CFL-2026-00001');
  });

  it('starting a review does not email the applicant', async () => {
    const d = deps();
    await decide(d, { applicationId: 'app1', decision: 'start_review' });
    expect(d.mailer.send).not.toHaveBeenCalled();
  });

  it('refuses decisions that the workflow does not allow', async () => {
    const d = deps({ repo: fakeRepo([{ ...application, status: 'approved', userId: 'student1' }]) });
    await expect(decide(d, { applicationId: 'app1', decision: 'reject' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(decide(d, { applicationId: 'app1', decision: 'approve' })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(d.provision).not.toHaveBeenCalled();
  });

  it('validates the request and the application', async () => {
    const d = deps();
    await expect(decide(d, { applicationId: 'app1', decision: 'delete' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(decide(d, { decision: 'approve' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(decide(d, { applicationId: 'missing', decision: 'approve' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('still records the decision when the notification email fails', async () => {
    const d = deps({ mailer: { send: vi.fn().mockRejectedValue(new Error('smtp down')) } });
    await expect(decide(d, { applicationId: 'app1', decision: 'waitlist' })).resolves.toMatchObject({ status: 'waitlisted' });
    expect(d.log.warn).toHaveBeenCalled();
  });

  it('does not record an approval if the account could not be created', async () => {
    const d = deps({ provision: vi.fn().mockRejectedValue(new Error('auth down')) });
    await expect(decide(d, { applicationId: 'app1', decision: 'approve' })).rejects.toThrow('auth down');
    expect(d.repo.applyDecision).not.toHaveBeenCalled();
  });
});
