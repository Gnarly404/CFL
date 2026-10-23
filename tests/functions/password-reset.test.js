import { describe, expect, it, vi } from 'vitest';
import { requestPasswordResetCore } from '../../functions/src/auth/request-password-reset.js';

function dependencies(overrides = {}) {
  return {
    auth: {
      getUserByEmail: vi.fn().mockResolvedValue({ displayName: 'Student' }),
      generatePasswordResetLink: vi.fn().mockResolvedValue('https://cfl.test/activate?oobCode=code'),
    },
    baseUrl: 'https://cfl.test',
    hash: (value) => `hashed-${value}`,
    limiter: { hit: vi.fn().mockResolvedValue({ allowed: true }) },
    mailer: { send: vi.fn().mockResolvedValue(undefined) },
    log: { error: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

describe('requestPasswordResetCore', () => {
  it('limits reset email work by normalized address and sends a reset link', async () => {
    const deps = dependencies();
    await expect(requestPasswordResetCore(deps, { data: { email: ' STUDENT@EXAMPLE.COM ' } }))
      .resolves.toEqual({ accepted: true });
    expect(deps.limiter.hit).toHaveBeenNthCalledWith(1, 'reset:cooldown:hashed-student@example.com', {
      limit: 1, windowMs: 15 * 60 * 1000,
    });
    expect(deps.limiter.hit).toHaveBeenNthCalledWith(2, 'reset:daily:hashed-student@example.com', {
      limit: 5, windowMs: 24 * 60 * 60 * 1000,
    });
    expect(deps.auth.generatePasswordResetLink).toHaveBeenCalledWith('student@example.com', {
      url: 'https://cfl.test/activate',
    });
    expect(deps.mailer.send).toHaveBeenCalledOnce();
  });

  it('returns the same response for addresses without an account', async () => {
    const deps = dependencies({
      auth: { getUserByEmail: vi.fn().mockRejectedValue({ code: 'auth/user-not-found' }) },
    });
    await expect(requestPasswordResetCore(deps, { data: { email: 'unknown@example.com' } }))
      .resolves.toEqual({ accepted: true });
    expect(deps.mailer.send).not.toHaveBeenCalled();
  });

  it('rejects reset quota exhaustion before contacting Authentication', async () => {
    const deps = dependencies({
      limiter: {
        hit: vi.fn()
          .mockResolvedValueOnce({ allowed: false })
          .mockResolvedValueOnce({ allowed: true })
          .mockResolvedValueOnce({ allowed: true }),
      },
    });
    await expect(requestPasswordResetCore(deps, { data: { email: 'student@example.com' } }))
      .rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(deps.auth.getUserByEmail).not.toHaveBeenCalled();
  });

  it('rejects malformed email addresses', async () => {
    const deps = dependencies();
    await expect(requestPasswordResetCore(deps, { data: { email: 'not-an-email' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(deps.limiter.hit).not.toHaveBeenCalled();
  });
});
