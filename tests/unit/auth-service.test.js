import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, browserSessionPersistence, reload, sendEmailVerification, setPersistence, signInWithEmailAndPassword, signOut } = vi.hoisted(() => ({
  auth: { currentUser: null },
  browserSessionPersistence: { type: 'session' },
  reload: vi.fn(),
  sendEmailVerification: vi.fn(),
  setPersistence: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  browserSessionPersistence,
  reload: (...args) => reload(...args),
  sendEmailVerification: (...args) => sendEmailVerification(...args),
  setPersistence: (...args) => setPersistence(...args),
  signInWithEmailAndPassword: (...args) => signInWithEmailAndPassword(...args),
  signOut: (...args) => signOut(...args),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/services/firebase-auth.js', () => ({ authService: () => auth }));
vi.mock('@/services/firebase-db.js', () => ({ dbService: () => ({}) }));
vi.mock('@/services/firebase-functions.js', () => ({ functionsService: () => ({}) }));

import { signIn } from '@/services/auth-service.js';

describe('signIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.currentUser = null;
    signOut.mockImplementation(async () => { auth.currentUser = null; });
  });

  it('sends verification email and denies portal access to an unverified account', async () => {
    const user = { uid: 'student', emailVerified: false, getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'student', email_verified: false } }) };
    auth.currentUser = user;
    signInWithEmailAndPassword.mockResolvedValue({ user });
    setPersistence.mockResolvedValue();
    reload.mockResolvedValue();
    sendEmailVerification.mockResolvedValue();
    signOut.mockImplementation(async () => { auth.currentUser = null; });

    await expect(signIn({ email: 'student@example.com', password: 'secret' }))
      .rejects.toMatchObject({ code: 'email-not-verified' });
    expect(sendEmailVerification).toHaveBeenCalledWith(user);
    expect(signOut).toHaveBeenCalledWith(auth);
  });

  it('uses tab-scoped persistence so a copied link does not transfer a signed-in session', async () => {
    const user = { uid: 'student', emailVerified: true, getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'student', email_verified: true } }) };
    auth.currentUser = user;
    signInWithEmailAndPassword.mockResolvedValue({ user });
    setPersistence.mockResolvedValue();
    reload.mockResolvedValue();

    await expect(signIn({ email: 'student@example.com', password: 'secret' }))
      .resolves.toMatchObject({ user, role: 'student' });
    expect(setPersistence).toHaveBeenCalledWith(auth, browserSessionPersistence);
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });
});
