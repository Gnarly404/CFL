import { loginUrl, ROUTES, homeFor } from '@/core/routes.js';
import { currentSession, signOutUser } from './session.js';

/**
 * Pure access decision, kept separate from the browser so it can be unit-tested.
 * @returns {{ allow: boolean, redirect?: string, signOut?: boolean }}
 */
export function evaluateAccess(session, allowedRoles, here = '/') {
  if (!session?.user) return { allow: false, redirect: loginUrl(here) };
  if (!session.role) return { allow: false, signOut: true, redirect: `${ROUTES.login}?reason=no-role` };
  if (!allowedRoles.includes(session.role)) return { allow: false, redirect: homeFor(session.role) };
  return { allow: true };
}

function showSignedInUser(user) {
  const name = user.displayName?.trim() || user.email || 'Signed in';
  document.querySelectorAll('[data-user-name]').forEach((node) => {
    node.textContent = name;
    if (user.email) node.title = user.email;
  });
}

function guardHistoryRestore(session, roles, navigate) {
  window.addEventListener('pageshow', async (event) => {
    if (!event.persisted) return;
    document.documentElement.setAttribute('data-auth', 'pending');
    const here = `${window.location.pathname}${window.location.search}`;
    try {
      const restored = await currentSession();
      const decision = evaluateAccess(restored, roles, here);
      if (!decision.allow || restored.user.uid !== session.user.uid || restored.role !== session.role) {
        if (decision.signOut) await signOutUser();
        navigate(decision.allow ? homeFor(restored.role) : decision.redirect);
        return;
      }
      showSignedInUser(restored.user);
      document.documentElement.removeAttribute('data-auth');
    } catch (error) {
      console.warn('Could not revalidate the restored session', error?.code ?? error);
      navigate(loginUrl(here));
    }
  });
}

/**
 * Protects a page. Protected pages ship with <html data-auth="pending"> (hidden by CSS);
 * the attribute is removed only after the role check passes.
 * If access is denied the person is redirected and the returned promise never settles,
 * so nothing after `await guardPage(...)` runs.
 */
export async function guardPage({ roles, navigate = (url) => window.location.replace(url) }) {
  const session = await currentSession();
  const decision = evaluateAccess(session, roles, `${window.location.pathname}${window.location.search}`);
  if (!decision.allow) {
    if (decision.signOut) await signOutUser();
    navigate(decision.redirect);
    return new Promise(() => {});
  }
  showSignedInUser(session.user);
  wireSignOut(); // wire controls before the page becomes visible, so an early click is never lost
  guardHistoryRestore(session, roles, navigate);
  document.documentElement.removeAttribute('data-auth');
  return session;
}

/** Connects every [data-action="sign-out"] control. */
export function wireSignOut(root = document, navigate = (url) => (window.cflNavigate ?? ((target) => window.location.replace(target)))(url)) {
  root.querySelectorAll('[data-action="sign-out"]').forEach((control) => {
    control.addEventListener('click', async (event) => {
      event.preventDefault();
      await signOutUser();
      navigate(`${ROUTES.login}?reason=signed-out`);
    });
  });
}
