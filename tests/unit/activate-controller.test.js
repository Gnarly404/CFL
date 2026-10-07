// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { initActivate, passwordStrength } from '@/auth/activate-controller.js';
import { fill, loadPage } from '../helpers.js';

function setup({ search = '', ...overrides } = {}) {
  loadPage('activate.html');
  const deps = {
    inspect: vi.fn().mockResolvedValue('student@example.com'),
    complete: vi.fn().mockResolvedValue(),
    applyAction: vi.fn().mockResolvedValue(),
    requestReset: vi.fn().mockResolvedValue(),
    ...overrides,
  };
  const ready = initActivate({ search, ...deps });
  return { ready, deps };
}
const visibleStates = () => [...document.querySelectorAll('[data-state]')].filter((n) => !n.hidden).map((n) => n.dataset.state);
const submitForm = (form) => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
const text = (selector) => document.querySelector(selector)?.textContent ?? '';

describe('passwordStrength', () => {
  it('scores length and variety from 0 to 4', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(0);
    expect(passwordStrength('Abcdefg1')).toBe(2);
    expect(passwordStrength('Abcdefghijk1!')).toBe(4);
  });
});

describe('account link page', () => {
  it('offers to send a link when opened without a code', async () => {
    const { ready } = setup();
    await ready;
    expect(visibleStates()).toEqual(['request']);
  });

  it('shows the password form for a valid invitation link', async () => {
    const { ready, deps } = setup({ search: '?mode=resetPassword&oobCode=ABC&invite=1' });
    await ready;
    expect(deps.inspect).toHaveBeenCalledWith('ABC');
    expect(visibleStates()).toEqual(['password']);
    expect(text('#accountEmail')).toBe('student@example.com');
    expect(text('#activateHeading')).toMatch(/Welcome/);
  });

  it('falls back to requesting a new link when the code is expired', async () => {
    const { ready } = setup({
      search: '?mode=resetPassword&oobCode=OLD',
      inspect: vi.fn().mockRejectedValue({ code: 'auth/expired-action-code' }),
    });
    await ready;
    expect(visibleStates()).toEqual(['request']);
    expect(text('#activateError')).toMatch(/expired/);
  });

  it('rejects weak or mismatched passwords before calling the server', async () => {
    const { ready, deps } = setup({ search: '?mode=resetPassword&oobCode=ABC' });
    await ready;
    const form = document.querySelector('#passwordForm');

    fill(form, { newPassword: 'short', confirmPassword: 'short' });
    submitForm(form);
    expect(text('#newPassword-error')).toMatch(/at least 8/);

    fill(form, { newPassword: 'Mango-trees-2026', confirmPassword: 'Mango-trees-2027' });
    submitForm(form);
    expect(text('#confirmPassword-error')).toMatch(/do not match/);
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('saves a good password and confirms', async () => {
    const { ready, deps } = setup({ search: '?mode=resetPassword&oobCode=ABC' });
    await ready;
    const form = document.querySelector('#passwordForm');
    fill(form, { newPassword: 'Mango-trees-2026', confirmPassword: 'Mango-trees-2026' });
    submitForm(form);
    await vi.waitFor(() => expect(visibleStates()).toEqual(['done']));
    expect(deps.complete).toHaveBeenCalledWith('ABC', 'Mango-trees-2026');
    expect(text('#doneMessage')).toMatch(/password is saved/);
  });

  it('applies email verification links', async () => {
    const { ready, deps } = setup({ search: '?mode=verifyEmail&oobCode=XYZ' });
    await ready;
    expect(deps.applyAction).toHaveBeenCalledWith('XYZ');
    expect(visibleStates()).toEqual(['done']);
  });

  it('sends a new link without revealing whether the account exists', async () => {
    const { ready, deps } = setup();
    await ready;
    const form = document.querySelector('#requestForm');
    fill(form, { requestEmail: 'someone@example.com' });
    submitForm(form);
    await vi.waitFor(() => expect(document.querySelector('#requestNotice').hidden).toBe(false));
    expect(deps.requestReset).toHaveBeenCalledWith('someone@example.com');
    expect(text('#requestNotice')).toMatch(/If an account exists/);
  });
});
