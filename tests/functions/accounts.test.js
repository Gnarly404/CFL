import { describe, expect, it, vi } from 'vitest';
import { buildActivationUrl, provisionAccount } from '../../functions/src/lib/invite.js';
import { requireRole } from '../../functions/src/lib/require-role.js';
import { adminCreateUserCore } from '../../functions/src/admin/create-user.js';
import { adminSetUserStatusCore } from '../../functions/src/admin/set-user-status.js';
import { adminSetUserRoleCore } from '../../functions/src/admin/set-user-role.js';
import { adminResendInviteCore } from '../../functions/src/admin/resend-invite.js';
import { activateAccountCore } from '../../functions/src/auth/activate-account.js';
import {
  fakeAuth, fakeDb, fakeFieldValue, fakeMailer,
} from './helpers/fakes.js';

const baseUrl = 'https://cfl.test';
function env(users = []) {
  const deps = {
    auth: fakeAuth(users), db: fakeDb(), FieldValue: fakeFieldValue(), mailer: fakeMailer(), baseUrl, audit: vi.fn(), exposeLinks: false,
  };
  deps.provision = (input) => provisionAccount(deps, input);
  return deps;
}
const actor = { uid: 'admin1', role: 'admin' };

describe('buildActivationUrl', () => {
  it('keeps only the one-time code and points at our own page', () => {
    const url = new URL(buildActivationUrl('https://x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC123&apiKey=k&continueUrl=z', baseUrl));
    expect(url.origin + url.pathname).toBe('https://cfl.test/activate');
    expect(Object.fromEntries(url.searchParams)).toEqual({ mode: 'resetPassword', oobCode: 'ABC123', invite: '1' });
  });
  it('fails loudly if Firebase returns no code', () => {
    expect(() => buildActivationUrl('https://x/y?mode=resetPassword', baseUrl)).toThrow(/action code/);
  });
});

describe('provisionAccount', () => {
  const input = { email: 'new@example.com', displayName: 'New Student', role: 'student', createdBy: 'admin1', profile: { firstName: 'New' } };

  it('creates the account, role claim, documents and invitation email', async () => {
    const d = env();
    const result = await provisionAccount(d, input);
    expect(result.invited).toBe(true);
    const user = d.auth.users.get(result.uid);
    expect(user.customClaims).toEqual({ role: 'student' });
    expect(d.db.store.get(`users/${result.uid}`)).toMatchObject({ role: 'student', status: 'invited', email: 'new@example.com', createdBy: 'admin1' });
    expect(d.db.store.get(`students/${result.uid}`)).toMatchObject({ profile: { firstName: 'New' }, instructorIds: [] });
    expect(d.mailer.sent).toHaveLength(1);
    expect(d.mailer.sent[0].text).toContain('https://cfl.test/activate?mode=resetPassword&oobCode=');
  });

  it('is safe to repeat: no duplicate account, profile data kept, link re-sent', async () => {
    const d = env();
    const first = await provisionAccount(d, input);
    d.db.store.set(`students/${first.uid}`, { ...d.db.store.get(`students/${first.uid}`), instructorIds: ['ins1'] });
    const second = await provisionAccount(d, { ...input, profile: { firstName: 'Changed' } });
    expect(second.uid).toBe(first.uid);
    expect(d.auth.users.size).toBe(1);
    expect(d.db.store.get(`students/${first.uid}`).instructorIds).toEqual(['ins1']);
    expect(d.db.store.get(`students/${first.uid}`).profile).toEqual({ firstName: 'New' });
    expect(d.mailer.sent).toHaveLength(2);
  });

  it('does not re-invite someone who already activated', async () => {
    const d = env();
    const { uid } = await provisionAccount(d, input);
    d.db.store.set(`users/${uid}`, { ...d.db.store.get(`users/${uid}`), status: 'active' });
    const again = await provisionAccount(d, input);
    expect(again).toMatchObject({ uid, invited: false, activationUrl: null });
    expect(d.mailer.sent).toHaveLength(1);
  });

  it('will not change the role of an existing account', async () => {
    const d = env([{ uid: 'u1', email: 'new@example.com', customClaims: { role: 'admin' } }]);
    await expect(provisionAccount(d, input)).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('refuses to invite a disabled account', async () => {
    const d = env();
    const { uid } = await provisionAccount(d, input);
    d.db.store.set(`users/${uid}`, { ...d.db.store.get(`users/${uid}`), status: 'disabled' });
    await expect(provisionAccount(d, input)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('can be limited to existing accounts (resend)', async () => {
    await expect(provisionAccount(env(), { ...input, resendOnly: true })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('requireRole', () => {
  const request = (uid) => ({ auth: uid ? { uid, token: { role: 'admin' } } : undefined });

  it('requires a signed-in caller', async () => {
    await expect(requireRole(request(null), ['admin'], { auth: fakeAuth() })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('uses the live role, not the possibly stale token', async () => {
    const auth = fakeAuth([{ uid: 'u1', email: 'a@b.co', customClaims: { role: 'student' } }]);
    await expect(requireRole(request('u1'), ['admin'], { auth })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('rejects disabled accounts and accounts that no longer exist', async () => {
    const auth = fakeAuth([{ uid: 'u1', customClaims: { role: 'admin' }, disabled: true }]);
    await expect(requireRole(request('u1'), ['admin'], { auth })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(requireRole(request('ghost'), ['admin'], { auth })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('returns the caller when the role matches', async () => {
    const auth = fakeAuth([{ uid: 'u1', email: 'a@b.co', customClaims: { role: 'admin' } }]);
    await expect(requireRole(request('u1'), ['admin', 'instructor'], { auth })).resolves.toEqual({ uid: 'u1', role: 'admin', email: 'a@b.co' });
  });
});

describe('adminCreateUser', () => {
  it('validates input', async () => {
    const d = env();
    await expect(adminCreateUserCore(d, { actor, data: { email: 'bad', displayName: 'Ann Lee', role: 'student' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(adminCreateUserCore(d, { actor, data: { email: 'a@b.co', displayName: '', role: 'student' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(adminCreateUserCore(d, { actor, data: { email: 'a@b.co', displayName: 'Ann Lee', role: 'superuser' } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('creates the account, audits it, and only exposes the link in the emulator', async () => {
    const d = env();
    const result = await adminCreateUserCore(d, { actor, data: { email: 'Ann@Example.com', displayName: ' Ann  Lee ', role: 'instructor' } });
    expect(result).toEqual({ uid: expect.any(String), invited: true });
    expect(d.auth.users.get(result.uid)).toMatchObject({ email: 'ann@example.com', displayName: 'Ann Lee', customClaims: { role: 'instructor' } });
    expect(d.db.store.get(`instructors/${result.uid}`)).toBeDefined();
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.create', actorId: 'admin1' }));
    const local = await adminCreateUserCore({ ...d, exposeLinks: true }, { actor, data: { email: 'b@example.com', displayName: 'Bob Ray', role: 'student' } });
    expect(local.activationUrl).toContain('/activate?mode=resetPassword');
  });
});

describe('adminSetUserStatus', () => {
  async function withUser() {
    const d = env();
    const { uid } = await provisionAccount(d, { email: 'p@example.com', displayName: 'Pat Doe', role: 'student', createdBy: 'admin1' });
    return { d, uid };
  }
  it('blocks self-service changes and unknown accounts', async () => {
    const { d } = await withUser();
    await expect(adminSetUserStatusCore(d, { actor, data: { uid: 'admin1', disabled: true } })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(adminSetUserStatusCore(d, { actor, data: { uid: 'ghost', disabled: true } })).rejects.toMatchObject({ code: 'not-found' });
    await expect(adminSetUserStatusCore(d, { actor, data: { uid: 'x' } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('disabling signs the person out everywhere; enabling restores the previous state', async () => {
    const { d, uid } = await withUser();
    await adminSetUserStatusCore(d, { actor, data: { uid, disabled: true } });
    expect(d.auth.users.get(uid).disabled).toBe(true);
    expect(d.auth.revoked).toContain(uid);
    expect(d.db.store.get(`users/${uid}`).status).toBe('disabled');
    const back = await adminSetUserStatusCore(d, { actor, data: { uid, disabled: false } });
    expect(back.status).toBe('invited'); // never activated
    d.db.store.set(`users/${uid}`, { ...d.db.store.get(`users/${uid}`), activatedAt: 'ts' });
    const active = await adminSetUserStatusCore(d, { actor, data: { uid, disabled: false } });
    expect(active.status).toBe('active');
  });
});

describe('adminSetUserRole', () => {
  it('changes the claim, signs the person out, and creates the new profile document', async () => {
    const d = env();
    const { uid } = await provisionAccount(d, { email: 'p@example.com', displayName: 'Pat Doe', role: 'student', createdBy: 'admin1' });
    await expect(adminSetUserRoleCore(d, { actor, data: { uid: 'admin1', role: 'student' } })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(adminSetUserRoleCore(d, { actor, data: { uid, role: 'root' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await adminSetUserRoleCore(d, { actor, data: { uid, role: 'instructor' } });
    expect(d.auth.users.get(uid).customClaims).toEqual({ role: 'instructor' });
    expect(d.auth.revoked).toContain(uid);
    expect(d.db.store.get(`users/${uid}`).role).toBe('instructor');
    expect(d.db.store.get(`instructors/${uid}`)).toBeDefined();
    expect(d.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.role', metadata: { from: 'student', to: 'instructor' } }));
  });
});

describe('adminResendInvite and activateAccount', () => {
  it('only resends to people who have not activated', async () => {
    const d = env();
    const { uid } = await provisionAccount(d, { email: 'p@example.com', displayName: 'Pat Doe', role: 'student', createdBy: 'admin1' });
    await adminResendInviteCore(d, { actor, data: { uid } });
    expect(d.mailer.sent).toHaveLength(2);
    d.db.store.set(`users/${uid}`, { ...d.db.store.get(`users/${uid}`), status: 'active' });
    await expect(adminResendInviteCore(d, { actor, data: { uid } })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(adminResendInviteCore(d, { actor, data: { uid: 'ghost' } })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('activation marks an invited account active and verifies the email, once', async () => {
    const d = env();
    const { uid } = await provisionAccount(d, { email: 'p@example.com', displayName: 'Pat Doe', role: 'student', createdBy: 'admin1' });
    await expect(activateAccountCore(d, { uid })).resolves.toEqual({ status: 'active' });
    expect(d.auth.users.get(uid).emailVerified).toBe(true);
    expect(d.db.store.get(`users/${uid}`).activatedAt).toBe('SERVER_TS');
    await expect(activateAccountCore(d, { uid })).resolves.toEqual({ status: 'active' });
    expect(d.audit).toHaveBeenCalledTimes(1);
  });

  it('activation refuses disabled and unknown accounts', async () => {
    const d = env();
    d.db.store.set('users/u9', { status: 'disabled' });
    await expect(activateAccountCore(d, { uid: 'u9' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(activateAccountCore(d, { uid: 'nobody' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
