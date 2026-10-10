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
  wireSignOut(); // wire controls before the page becomes visible, so an early click is never lost
  document.documentElement.removeAttribute('data-auth');
  return session;
}

/** Connects every [data-action="sign-out"] control. */
export function wireSignOut(root = document, navigate = (url) => (window.cflNavigate ?? ((target) => window.location.assign(target)))(url)) {
  root.querySelectorAll('[data-action="sign-out"]').forEach((control) => {
    control.addEventListener('click', async (event) => {
      event.preventDefault();
      await signOutUser();
      navigate(`${ROUTES.login}?reason=signed-out`);
    });
  });
}
