import { postLoginDestination } from '@/core/routes.js';
import { validateEmail } from '@/utils/validation.js';
import { setBusy, setFieldError, showMessage, wirePasswordToggles } from '@/utils/dom.js';
import { signIn } from '@/services/auth-service.js';
import { requestPasswordReset } from '@/services/password-service.js';
import { currentSession } from './session.js';
import { describeAuthError } from './auth-errors.js';

const NOTICES = {
  'signed-out': 'You have been signed out.',
  'no-role': "Your account isn't set up yet. Contact admissions for help.",
  'session-expired': 'Your session ended. Sign in again to continue.',
  activated: 'Your password is saved. Sign in to continue.',
};

/**
 * Sign-in page controller. Collaborators are injectable so the behaviour can be tested without a browser or Firebase.
 */
export function initLogin({
  root = document,
  search = window.location.search,
  signInFn = signIn,
  resetFn = requestPasswordReset,
  getSession = currentSession,
  navigate = (url) => (window.cflNavigate ?? ((target) => window.location.assign(target)))(url),
} = {}) {
  const form = root.querySelector('#loginForm');
  if (!form) return;
  const emailInput = form.querySelector('#email');
  const passwordInput = form.querySelector('#password');
  const remember = form.querySelector('#rememberMe');
  const submit = form.querySelector('button[type="submit"]');
  const notice = root.querySelector('#loginNotice');
  const alert = root.querySelector('#loginError');
  const forgot = root.querySelector('#forgotPasswordLink');

  const params = new URLSearchParams(search);
  const next = params.get('next');
  const reason = params.get('reason') ?? (params.get('activated') === '1' ? 'activated' : null);
  if (reason && NOTICES[reason]) showMessage(notice, NOTICES[reason], reason === 'no-role' ? 'error' : 'info');

  wirePasswordToggles(root);

  // Someone who is already signed in goes straight to their portal.
  getSession().then((session) => {
    if (session.user && session.role) navigate(postLoginDestination(session.role, next));
  }).catch(() => {});

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(alert, '');
    showMessage(notice, '');

    const emailError = validateEmail(emailInput.value);
    const passwordError = passwordInput.value ? null : 'Enter your password.';
    setFieldError(emailInput, emailError);
    setFieldError(passwordInput, passwordError);
    if (emailError || passwordError) {
      (emailError ? emailInput : passwordInput).focus();
      return;
    }

    setBusy(submit, true, 'Signing in…');
    try {
      const { role } = await signInFn({
        email: emailInput.value.trim(),
        password: passwordInput.value,
        remember: remember.checked,
      });
      navigate(postLoginDestination(role, next));
    } catch (error) {
      passwordInput.value = '';
      showMessage(alert, describeAuthError(error), 'error');
      passwordInput.focus();
      setBusy(submit, false);
    }
  });

  forgot?.addEventListener('click', async () => {
    showMessage(alert, '');
    const emailError = validateEmail(emailInput.value);
    setFieldError(emailInput, emailError ? 'Enter your email address here, then select "Forgot password".' : null);
    if (emailError) {
      emailInput.focus();
      return;
    }
    try {
      await resetFn(emailInput.value.trim());
      showMessage(notice, 'If an account exists for that address, we have sent a link to choose a new password.', 'success');
    } catch (error) {
      showMessage(alert, describeAuthError(error), 'error');
    }
  });
}
