// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { initLogin } from '@/auth/login-controller.js';
import { fill, loadPage } from '../helpers.js';

function setup({
  search = '', signInFn = vi.fn().mockResolvedValue({ role: 'student' }), resetFn = vi.fn().mockResolvedValue(),
  getSession = async () => ({ user: null, role: null }),
} = {}) {
  loadPage('login.html');
  const navigate = vi.fn();
  initLogin({ search, signInFn, resetFn, getSession, navigate });
  const form = document.querySelector('#loginForm');
  return { form, signInFn, resetFn, navigate };
}
const submitForm = (form) => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
const text = (selector) => document.querySelector(selector)?.textContent ?? '';

describe('sign-in page', () => {
  it('checks the email and password before calling the server', () => {
    const { form, signInFn } = setup();
    fill(form, { email: 'nope', password: 'secret' });
    submitForm(form);
    expect(signInFn).not.toHaveBeenCalled();
    expect(text('#email-error')).toMatch(/valid email/i);

    fill(form, { email: 'a@b.co', password: '' });
    submitForm(form);
    expect(signInFn).not.toHaveBeenCalled();
    expect(text('#password-error')).toMatch(/password/i);
  });

  it('signs in and opens the right portal', async () => {
    const { form, signInFn, navigate } = setup();
    fill(form, { email: ' student@example.com ', password: 'Secret-123', rememberMe: true });
    submitForm(form);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/student/dashboard'));
    expect(signInFn).toHaveBeenCalledWith({ email: 'student@example.com', password: 'Secret-123', remember: true });
  });

  it('returns to the page that asked for sign-in when the role allows it', async () => {
    const { form, navigate } = setup({ search: '?next=%2Fstudent%2Fdashboard%3Ftab%3D2' });
    fill(form, { email: 'a@b.co', password: 'x' });
    submitForm(form);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/student/dashboard?tab=2'));
  });

  it('never follows a ?next= that the role may not open or that leaves the site', async () => {
    for (const next of ['/admin/dashboard', '//evil.com', 'https://evil.com']) {
      const { form, navigate } = setup({ search: `?next=${encodeURIComponent(next)}` });
      fill(form, { email: 'a@b.co', password: 'x' });
      submitForm(form);
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/student/dashboard'));
    }
  });

  it('shows a generic message on failure, clears the password and lets the person retry', async () => {
    const failure = { code: 'auth/wrong-password' };
    const { form, navigate } = setup({ signInFn: vi.fn().mockRejectedValue(failure) });
    fill(form, { email: 'a@b.co', password: 'wrong' });
    submitForm(form);
    await vi.waitFor(() => expect(document.querySelector('#loginError').hidden).toBe(false));
    expect(text('#loginError')).toMatch(/don't match/);
    expect(document.querySelector('#password').value).toBe('');
    expect(document.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sends a reset link without revealing whether the account exists', async () => {
    const { form, resetFn } = setup();
    document.querySelector('#forgotPasswordLink').click();
    expect(resetFn).not.toHaveBeenCalled();
    expect(text('#email-error')).toMatch(/enter your email/i);

    fill(form, { email: ' student@example.com ' });
    document.querySelector('#forgotPasswordLink').click();
    await vi.waitFor(() => expect(document.querySelector('#loginNotice').hidden).toBe(false));
    expect(resetFn).toHaveBeenCalledWith('student@example.com');
    expect(text('#loginNotice')).toMatch(/If an account exists/);
  });

  it('explains why the person landed here', () => {
    setup({ search: '?reason=signed-out' });
    expect(text('#loginNotice')).toMatch(/signed out/);
    setup({ search: '?activated=1' });
    expect(text('#loginNotice')).toMatch(/password is saved/);
  });

  it('moves people who are already signed in straight to their portal', async () => {
    const { navigate } = setup({ getSession: async () => ({ user: { uid: 'u' }, role: 'admin' }) });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/dashboard'));
  });
});
