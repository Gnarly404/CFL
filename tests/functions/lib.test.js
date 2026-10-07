import { describe, expect, it } from 'vitest';
import { createRateLimiter, hashKey, nextWindowState } from '../../functions/src/lib/rate-limit.js';
import { formatReference } from '../../functions/src/lib/repos.js';
import { accountInvite, applicationReceived, applicationUpdate } from '../../functions/src/lib/templates.js';
import { fakeDb } from './helpers/fakes.js';

describe('nextWindowState', () => {
  const policy = { limit: 2, windowMs: 1000 };
  it('allows up to the limit then blocks until the window ends', () => {
    let state = null;
    for (const t of [0, 100]) {
      const r = nextWindowState(state, t, policy);
      expect(r.allowed).toBe(true);
      state = r.state;
    }
    const blocked = nextWindowState(state, 200, policy);
    expect(blocked).toMatchObject({ allowed: false, retryAfterMs: 800 });
    expect(nextWindowState(blocked.state, 1000, policy).allowed).toBe(true);
  });
});

describe('createRateLimiter', () => {
  it('counts hits in Firestore and expires old counters', async () => {
    const db = fakeDb();
    let now = 0;
    const limiter = createRateLimiter({ db, now: () => now });
    const policy = { limit: 2, windowMs: 1000 };
    expect((await limiter.hit('k', policy)).allowed).toBe(true);
    expect((await limiter.hit('k', policy)).allowed).toBe(true);
    expect((await limiter.hit('k', policy)).allowed).toBe(false);
    expect((await limiter.hit('other', policy)).allowed).toBe(true);
    now = 5000;
    expect((await limiter.hit('k', policy)).allowed).toBe(true);
    expect(db.store.get('rateLimits/k').expiresAt).toBeInstanceOf(Date);
  });
});

describe('hashKey and references', () => {
  it('hashes deterministically with a salt and never returns the input', () => {
    expect(hashKey('203.0.113.9', 's')).toBe(hashKey('203.0.113.9', 's'));
    expect(hashKey('203.0.113.9', 's')).not.toBe(hashKey('203.0.113.9', 't'));
    expect(hashKey('203.0.113.9', 's')).not.toContain('203');
  });
  it('formats application references', () => {
    expect(formatReference(2026, 7)).toBe('CFL-2026-00007');
    expect(formatReference(2026, 12345)).toBe('CFL-2026-12345');
  });
});

describe('email templates', () => {
  it('escape names so a hostile name cannot inject markup', () => {
    const mail = accountInvite({ name: '<script>alert(1)</script>', activationUrl: 'https://cfl.test/activate?a=1&b=2', role: 'student' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('a=1&amp;b=2');
  });
  it('include the reference, the status link and plain-text fallbacks', () => {
    const received = applicationReceived({ name: 'Wanjiku', reference: 'CFL-2026-00001', baseUrl: 'https://cfl.test' });
    expect(received.subject).toContain('CFL-2026-00001');
    expect(received.text).toContain('https://cfl.test/admissions/status');
    const update = applicationUpdate({ name: 'Wanjiku', reference: 'CFL-2026-00001', status: 'waitlisted', baseUrl: 'https://cfl.test' });
    expect(update.text).toMatch(/waiting list/);
  });
});
