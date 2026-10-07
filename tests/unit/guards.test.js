import { describe, expect, it } from 'vitest';
import { evaluateAccess } from '@/auth/guards.js';

const signedIn = (role) => ({ user: { uid: 'u1' }, role });

describe('evaluateAccess', () => {
  it('sends signed-out visitors to sign in, remembering where they were going', () => {
    expect(evaluateAccess({ user: null, role: null }, ['student'], '/student/dashboard'))
      .toEqual({ allow: false, redirect: '/login?next=%2Fstudent%2Fdashboard' });
  });
  it('signs out accounts that have no role and explains why', () => {
    expect(evaluateAccess(signedIn(null), ['student'], '/student/dashboard'))
      .toEqual({ allow: false, signOut: true, redirect: '/login?reason=no-role' });
  });
  it('sends the wrong role to their own portal', () => {
    expect(evaluateAccess(signedIn('student'), ['admin'], '/admin/dashboard'))
      .toEqual({ allow: false, redirect: '/student/dashboard' });
  });
  it('allows a permitted role', () => {
    expect(evaluateAccess(signedIn('admin'), ['instructor', 'admin'])).toEqual({ allow: true });
  });
});
