import { describe, expect, it, vi } from 'vitest';
import { getApplicationStatusCore } from '../../functions/src/applications/status.js';
import { allowAllLimiter, fakeRepo, hash } from './helpers/fakes.js';

const stored = {
  id: 'a1', reference: 'CFL-2026-00001', email: 'parent@example.com', status: 'under_review', programmeId: 'general-english',
  applicant: { firstName: 'Wanjiku' }, guardian: { phoneNumber: '+254722000111' },
  createdAt: { toDate: () => new Date('2026-10-01T08:00:00Z') }, updatedAt: { toDate: () => new Date('2026-10-02T08:00:00Z') },
};
const deps = (extra = {}) => ({ limiter: allowAllLimiter(), repo: fakeRepo([stored]), hash, ...extra });
const ask = (d, data) => getApplicationStatusCore(d, { data, ip: '203.0.113.9' });

describe('getApplicationStatus', () => {
  it('returns only the status fields for a matching reference and email', async () => {
    const result = await ask(deps(), { reference: 'cfl-2026-00001', email: ' Parent@Example.com' });
    expect(result).toEqual({
      reference: 'CFL-2026-00001', status: 'under_review', programmeId: 'general-english',
      submittedAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-02T08:00:00.000Z',
    });
  });

  it('gives the same answer for a wrong email and an unknown reference', async () => {
    const wrongEmail = await ask(deps(), { reference: 'CFL-2026-00001', email: 'other@example.com' }).catch((e) => e);
    const unknown = await ask(deps(), { reference: 'CFL-2026-09999', email: 'parent@example.com' }).catch((e) => e);
    expect(wrongEmail.code).toBe('not-found');
    expect(unknown.code).toBe('not-found');
    expect(wrongEmail.message).toBe(unknown.message);
  });

  it('rejects malformed input before touching the database', async () => {
    const d = deps();
    await expect(ask(d, { reference: 'abc', email: 'parent@example.com' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(ask(d, { reference: 'CFL-2026-00001', email: 'nope' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(d.repo.findByReference).not.toHaveBeenCalled();
  });

  it('is rate limited', async () => {
    const limiter = { hit: vi.fn(async () => ({ allowed: false, retryAfterMs: 5 })) };
    await expect(ask(deps({ limiter }), { reference: 'CFL-2026-00001', email: 'parent@example.com' }))
      .rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
