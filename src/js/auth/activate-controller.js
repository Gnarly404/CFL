import { ROUTES } from '@/core/routes.js';
import { validateEmail, validatePassword } from '@/utils/validation.js';
import {
  setBusy, setFieldError, showMessage, wirePasswordToggles,
} from '@/utils/dom.js';
import {
  applyEmailAction, completePasswordReset, inspectResetCode, requestPasswordReset,
} from '@/services/password-service.js';
import { describeAuthError, isExpiredOrInvalidLink } from './auth-errors.js';

const STATES = ['loading', 'password', 'request', 'done'];

/** 0 (empty) to 4 (strong). Length matters most; variety helps. */
export function passwordStrength(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password)) score += 1;
  if (/\d/.test(password) && /[^\p{L}\d]/u.test(password)) score += 1;
  return score;
}

/**
 * Handles the links Firebase and our invitation emails open: ?mode=resetPassword&oobCode=...
 * (set a password), ?mode=verifyEmail / recoverEmail, or no code (request a new link).
 */
export async function initActivate({
  root = document,
  search = window.location.search,
  inspect = inspectResetCode,
  complete = completePasswordReset,
  applyAction = applyEmailAction,
  requestReset = requestPasswordReset,
} = {}) {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  const isInvite = params.get('invite') === '1';

  const panels = Object.fromEntries(STATES.map((name) => [name, root.querySelector(`[data-state="${name}"]`)]));
  const alert = root.querySelector('#activateError');
  const doneMessage = root.querySelector('#doneMessage');
  const heading = root.querySelector('#activateHeading');

  const show = (name) => STATES.forEach((state) => { if (panels[state]) panels[state].hidden = state !== name; });
  const finish = (message) => {
    doneMessage.textContent = message;
    show('done');
  };

  wirePasswordToggles(root);

  // "Request a new link" form.
  const requestForm = root.querySelector('#requestForm');
  requestForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(alert, '');
    const input = requestForm.querySelector('#requestEmail');
    const error = validateEmail(input.value);
    setFieldError(input, error);
    if (error) return;
    const button = requestForm.querySelector('button[type="submit"]');
    setBusy(button, true, 'Sending…');
    try {
      await requestReset(input.value.trim());
      requestForm.reset();
      showMessage(root.querySelector('#requestNotice'), 'If an account exists for that address, we have sent a new link.', 'success');
    } catch (err) {
      showMessage(alert, describeAuthError(err), 'error');
    } finally {
      setBusy(button, false);
    }
  });

  show('loading');
  if (!mode || !oobCode) {
    show('request');
    return;
  }

  try {
    if (mode === 'resetPassword') {
      const email = await inspect(oobCode);
      if (heading) heading.textContent = isInvite ? 'Welcome to CFL: choose your password' : 'Choose a new password';
      root.querySelector('#accountEmail').textContent = email;
      wirePasswordForm({ root, email, oobCode, complete, alert, finish });
      show('password');
    } else if (mode === 'verifyEmail' || mode === 'recoverEmail') {
      await applyAction(oobCode);
      finish(mode === 'verifyEmail' ? 'Your email address is confirmed.' : 'Your previous email address has been restored.');
    } else {
      show('request');
    }
  } catch (error) {
    show('request');
    showMessage(alert, describeAuthError(error), 'error');
    if (!isExpiredOrInvalidLink(error)) console.warn('Account link problem', error?.code ?? error);
  }
}

function wirePasswordForm({ root, email, oobCode, complete, alert, finish }) {
  const form = root.querySelector('#passwordForm');
  const password = form.querySelector('#newPassword');
  const confirm = form.querySelector('#confirmPassword');
  const bar = form.querySelector('.password-strength-bar');
  const classes = ['', 'weak', 'weak', 'medium', 'strong'];

  password.addEventListener('input', () => {
    const score = passwordStrength(password.value);
    bar.style.width = `${score * 25}%`;
    bar.className = `password-strength-bar ${classes[score]}`.trim();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(alert, '');
    const issues = validatePassword(password.value, { email });
    const mismatch = password.value !== confirm.value ? 'The two passwords do not match.' : null;
    setFieldError(password, issues[0] ?? null);
    setFieldError(confirm, issues.length ? null : mismatch);
    if (issues.length || mismatch) {
      (issues.length ? password : confirm).focus();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Saving…');
    try {
      await complete(oobCode, password.value);
      finish('Your password is saved. You can now sign in.');
    } catch (error) {
      showMessage(alert, describeAuthError(error), 'error');
      setBusy(button, false);
    }
  });
}

export const SIGN_IN_AFTER_ACTIVATION = `${ROUTES.login}?activated=1`;
