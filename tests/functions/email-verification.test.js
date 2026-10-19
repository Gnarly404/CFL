import { describe, expect, it, vi } from 'vitest';
import {
  CODE_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN_MS, VERIFIED_TTL_MS, applyGuess, consumeVerification,
  requestEmailVerificationCore, verificationKey, verifyEmailCodeCore,
} from '../../functions/src/applications/email-verification.js';
import {
  allowAllLimiter, fakeMailer, fakeVerifications, hash, log,
} from './helpers/fakes.js';

const T0 = new Date('2026-10-06T12:00:00Z');
const EMAIL = 'parent@example.com';

function deps(overrides = {}) {
  return {
    limiter: allowAllLimiter(), verifications: fakeVerifications(), mailer: fakeMailer(), hash, log: log(), ...overrides,
  };
}
const request = (d, data = { email: EMAIL, name: 'Wanjiku Kamau' }, at = T0) => (
  requestEmailVerificationCore(d, { data, ip: '203.0.113.9', now: () => at })
);
const verify = (d, code, at = T0, email = EMAIL) => verifyEmailCodeCore(d, { data: { email, code }, ip: '203.0.113.9', now: () => at });
const sentCode = (d) => d.mailer.sent.at(-1).text.match(/\b(\d{6})\b/)[1];
const later = (ms) => new Date(T0.getTime() + ms);

describe('requestEmailVerification', () => {
  it('emails a six-digit code and tells the browser only when it expires', async () => {
    const d = deps();
    const result = await request(d);
    expect(result).toEqual({ expiresAt: T0.getTime() + CODE_TTL_MS, resendAvailableAt: T0.getTime() + RESEND_COOLDOWN_MS });
    expect(d.mailer.sent).toHaveLength(1);
    expect(d.mailer.sent[0].to).toBe(EMAIL);
    expect(sentCode(d)).toMatch(/^\d{6}$/);
    expect(JSON.stringify(result)).not.toContain(sentCode(d));
  });

  it('stores only a digest of the code, never the code', async () => {
    const d = deps();
    await request(d);
    const stored = JSON.stringify([...d.verifications.records.values()]);
    expect(stored).not.toContain(sentCode(d));
    expect([...d.verifications.records.keys()][0]).not.toContain('parent');
  });

  it('normalises the address and rejects a bad one', async () => {
    const d = deps();
    await request(d, { email: '  Parent@Example.COM ' });
    expect(d.mailer.sent[0].to).toBe(EMAIL);
    await expect(request(d, { email: 'nope' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(request(d, null)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('makes the applicant wait out the cooldown before a second code', async () => {
    const d = deps();
    await request(d);
    await expect(request(d, undefined, later(30_000))).rejects.toMatchObject({ code: 'resource-exhausted', details: { reason: 'cooldown' } });
    expect(d.mailer.sent).toHaveLength(1);
    await request(d, undefined, later(RESEND_COOLDOWN_MS + 1));
    expect(d.mailer.sent).toHaveLength(2);
  });

  it('a new code replaces the old one', async () => {
    const d = deps();
    await request(d);
    const first = sentCode(d);
    await request(d, undefined, later(RESEND_COOLDOWN_MS + 1));
    const second = sentCode(d);
    if (first !== second) {
      await expect(verify(d, first, later(RESEND_COOLDOWN_MS + 2))).rejects.toMatchObject({ details: { reason: 'invalid' } });
    }
    await expect(verify(d, second, later(RESEND_COOLDOWN_MS + 3))).resolves.toEqual({ verified: true });
  });

  it('rate limits per connection and per address, with hashed keys', async () => {
    const blocked = { hit: vi.fn(async (key) => ({ allowed: !key.startsWith('verify:email:'), retryAfterMs: 1000 })) };
    const d = deps({ limiter: blocked });
    await expect(request(d)).rejects.toMatchObject({ code: 'resource-exhausted', details: { reason: 'rate-limited' } });
    expect(d.mailer.sent).toHaveLength(0);
    const keys = blocked.hit.mock.calls.map(([key]) => key);
    expect(keys.some((key) => key.includes('203.0.113.9') || key.includes('parent'))).toBe(false);
  });

  it('frees the cooldown when the email cannot be sent', async () => {
    const d = deps({ mailer: { send: vi.fn().mockRejectedValue(new Error('smtp down')) } });
    await expect(request(d)).rejects.toMatchObject({ code: 'unavailable' });
    expect(d.verifications.records.size).toBe(0);
    d.mailer = fakeMailer();
    await expect(request(d, undefined, later(1000))).resolves.toBeDefined();
  });
});

describe('verifyEmailCode', () => {
  it('accepts the emailed code once and marks the address verified', async () => {
    const d = deps();
    await request(d);
    await expect(verify(d, sentCode(d), later(1000))).resolves.toEqual({ verified: true });
    const record = d.verifications.records.get(verificationKey(hash, EMAIL));
    expect(record.verifiedUntil).toBe(T0.getTime() + 1000 + VERIFIED_TTL_MS);
    expect(record.codeDigest).toBeNull();
    await expect(verify(d, sentCode(d), later(2000))).rejects.toMatchObject({ details: { reason: 'missing' } });
  });

  it('rejects a wrong code without verifying', async () => {
    const d = deps();
    await request(d);
    const wrong = sentCode(d) === '000000' ? '000001' : '000000';
    await expect(verify(d, wrong)).rejects.toMatchObject({ code: 'invalid-argument', details: { reason: 'invalid' } });
    await expect(consumeVerification(d, EMAIL, T0.getTime())).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('locks the code after too many wrong guesses, even if the right one comes next', async () => {
    const d = deps();
    await request(d);
    const right = sentCode(d);
    const wrong = right === '000000' ? '000001' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await expect(verify(d, wrong)).rejects.toMatchObject({ details: { reason: 'invalid' } });
    }
    await expect(verify(d, right)).rejects.toMatchObject({ details: { reason: 'too-many-attempts' } });
  });

  it('counts parallel guesses, so they cannot beat the attempt limit', async () => {
    const d = deps();
    await request(d);
    const right = sentCode(d);
    const wrong = right === '000000' ? '000001' : '000000';
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => verify(d, wrong)));
    expect(outcomes.every((o) => o.status === 'rejected')).toBe(true);
    await expect(verify(d, right)).rejects.toMatchObject({ details: { reason: 'too-many-attempts' } });
  });

  it('rejects an expired code', async () => {
    const d = deps();
    await request(d);
    await expect(verify(d, sentCode(d), later(CODE_TTL_MS + 1))).rejects.toMatchObject({ details: { reason: 'expired' } });
  });

  it('rejects when no code was requested, and a code sent for another address', async () => {
    const d = deps();
    await expect(verify(d, '123456')).rejects.toMatchObject({ details: { reason: 'missing' } });
    await request(d);
    await expect(verify(d, sentCode(d), T0, 'other@example.com')).rejects.toMatchObject({ details: { reason: 'missing' } });
  });

  it.each(['12345', '1234567', 'abcdef', '', null, 123456])('rejects a malformed code (%j) without touching storage', async (code) => {
    const d = deps();
    await expect(verify(d, code)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(d.verifications.mutate).not.toHaveBeenCalled();
  });

  it('rate limits guessing per connection', async () => {
    const d = deps({ limiter: { hit: vi.fn(async () => ({ allowed: false, retryAfterMs: 1 })) } });
    await expect(verify(d, '123456')).rejects.toMatchObject({ details: { reason: 'rate-limited' } });
  });
});

describe('applyGuess', () => {
  it('leaves the record unchanged when there is nothing to check', () => {
    expect(applyGuess(null, { digest: 'x', nowMs: 1 })).toEqual({ next: null, result: { ok: false, reason: 'missing' } });
  });
});
