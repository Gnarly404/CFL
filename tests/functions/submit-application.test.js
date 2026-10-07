import { describe, expect, it, vi } from 'vitest';
import { submitApplicationCore } from '../../functions/src/applications/submit.js';
import {
  allowAllLimiter, fakeMailer, fakeRepo, hash, log,
} from './helpers/fakes.js';

const NOW = new Date('2026-10-06T12:00:00Z');
const valid = {
  firstName: 'Wanjiku', middleName: '', surname: 'Kamau', dateOfBirth: '2012-05-14', gender: 'female',
  email: ' Parent@Example.com ', phoneNumber: '0712 345 678', nationality: 'kenyan',
  guardianName: 'Grace Kamau', relationship: 'parent', guardianPhone: '0722000111',
  emergencyContact: 'Peter Kamau', consent: true, website: '',
};

function deps(overrides = {}) {
  return {
    limiter: allowAllLimiter(), repo: fakeRepo(), mailer: fakeMailer(), baseUrl: 'https://cfl.test', hash, log: log(), ...overrides,
  };
}
const run = (d, data, ip = '203.0.113.9') => submitApplicationCore(d, { data, ip, now: () => NOW });

describe('submitApplication', () => {
  it('stores a normalised application and returns its reference', async () => {
    const d = deps();
    const result = await run(d, valid);
    expect(result).toEqual({ reference: 'CFL-2026-00001', status: 'submitted' });
    const [stored, year] = d.repo.create.mock.calls[0];
    expect(year).toBe(2026);
    expect(stored).toMatchObject({
      email: 'parent@example.com',
      applicantName: 'Wanjiku Kamau',
      programmeId: null,
      applicant: { phoneNumber: '+254712345678', gender: 'female' },
      guardian: { name: 'Grace Kamau', phoneNumber: '+254722000111' },
      source: 'web',
    });
    expect(stored.consent.acceptedAt).toBe('2026-10-06T12:00:00.000Z');
  });

  it('emails a confirmation containing the reference', async () => {
    const d = deps();
    await run(d, valid);
    expect(d.mailer.sent).toHaveLength(1);
    expect(d.mailer.sent[0].to).toBe('parent@example.com');
    expect(d.mailer.sent[0].subject).toContain('CFL-2026-00001');
  });

  it('does not store the IP address or fields it does not know about', async () => {
    const d = deps();
    await run(d, { ...valid, role: 'admin', status: 'approved', userId: 'attacker' });
    const [stored] = d.repo.create.mock.calls[0];
    expect(JSON.stringify(stored)).not.toContain('203.0.113.9');
    expect(stored).not.toHaveProperty('role');
    expect(stored.status).toBeUndefined();
    expect(stored.userId).toBeUndefined();
  });

  it('rejects invalid input with per-field errors', async () => {
    const d = deps();
    const error = await run(d, { ...valid, email: 'nope', dateOfBirth: '2030-01-01' }).catch((e) => e);
    expect(error.code).toBe('invalid-argument');
    expect(Object.keys(error.details.fieldErrors).sort()).toEqual(['dateOfBirth', 'email']);
    expect(d.repo.create).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'text', 42])('rejects a non-object payload (%j)', async (payload) => {
    await expect(run(deps(), payload)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('quietly drops submissions that fill the hidden honeypot field', async () => {
    const d = deps();
    const result = await run(d, { ...valid, website: 'http://spam.example' });
    expect(result.status).toBe('submitted');
    expect(d.repo.create).not.toHaveBeenCalled();
    expect(d.mailer.send).not.toHaveBeenCalled();
  });

  it('limits repeated submissions per connection and per email', async () => {
    const blocked = { hit: vi.fn(async (key) => ({ allowed: !key.startsWith('apply:email:'), retryAfterMs: 1000 })) };
    const d = deps({ limiter: blocked });
    await expect(run(d, valid)).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(d.repo.create).not.toHaveBeenCalled();
    const keys = blocked.hit.mock.calls.map(([key]) => key);
    expect(keys.some((key) => key.includes('203.0.113.9'))).toBe(false); // hashed, never raw
  });

  it('refuses a second open application for the same email', async () => {
    const repo = fakeRepo([{ id: 'x', email: 'parent@example.com', status: 'under_review' }]);
    await expect(run(deps({ repo }), valid)).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('allows a new application after the earlier one was decided', async () => {
    const repo = fakeRepo([{ id: 'x', email: 'parent@example.com', status: 'rejected' }]);
    await expect(run(deps({ repo }), valid)).resolves.toMatchObject({ status: 'submitted' });
  });

  it('keeps the application even when the confirmation email fails', async () => {
    const mailer = { send: vi.fn().mockRejectedValue(new Error('smtp down')) };
    const d = deps({ mailer });
    await expect(run(d, valid)).resolves.toMatchObject({ reference: 'CFL-2026-00001' });
    expect(d.log.warn).toHaveBeenCalled();
  });
});
