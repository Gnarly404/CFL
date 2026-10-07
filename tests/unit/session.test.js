// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { currentSession } from '@/auth/session.js';

const mockAuth = { onAuthStateChanged: vi.fn() };

vi.mock('@/services/firebase-auth.js', () => ({ authService: () => mockAuth }));

describe('currentSession', () => {
  it('waits for Firebase auth state using the API available in Firebase 9', async () => {
    const user = { getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'admin' } }) };
    mockAuth.onAuthStateChanged.mockImplementation((next) => next(user));

    await expect(currentSession()).resolves.toEqual({ user, role: 'admin' });
    expect(mockAuth.onAuthStateChanged).toHaveBeenCalledTimes(1);
  });
});
