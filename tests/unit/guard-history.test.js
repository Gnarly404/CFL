// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { currentSession, signOutUser } = vi.hoisted(() => ({ currentSession: vi.fn(), signOutUser: vi.fn() }));
vi.mock('@/auth/session.js', () => ({ currentSession, signOutUser }));

const account = { user: { uid: 'stu1', displayName: 'Amina K', email: 'amina@example.test' }, role: 'student' };

describe('protected page history restore', () => {
  beforeEach(() => {
    currentSession.mockReset().mockResolvedValue(account);
    signOutUser.mockReset();
    document.documentElement.setAttribute('data-auth', 'pending');
    document.body.innerHTML = '<span data-user-name></span><a href="/login" data-action="sign-out">Sign out</a>';
    window.history.replaceState({}, '', '/student/dashboard');
  });

  it('shows the account name after authorization and hides a bfcache page after sign-out', async () => {
    vi.resetModules();
    const { guardPage } = await import('@/auth/guards.js');
    const navigate = vi.fn();
    await guardPage({ roles: ['student'], navigate });

    expect(document.querySelector('[data-user-name]').textContent).toBe('Amina K');
    expect(document.documentElement.hasAttribute('data-auth')).toBe(false);

    currentSession.mockResolvedValueOnce({ user: null, role: null });
    const event = new Event('pageshow');
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);

    expect(document.documentElement.getAttribute('data-auth')).toBe('pending');
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/login?next=%2Fstudent%2Fdashboard'));
    expect(document.documentElement.getAttribute('data-auth')).toBe('pending');
  });
});