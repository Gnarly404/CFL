import { startSessionLifecycle } from '@/auth/session-lifecycle.js';
import { signOutUser } from '@/auth/session.js';
import { ROUTES } from '@/core/routes.js';
import { waitForPendingSaves } from '@/utils/pending-saves.js';

const DRAFT_KEY = (uid) => `cfl:portal-drafts:${uid}:${window.location.pathname}`;
const LOADING_TEXT = /^loading(?:\b|\.\.\.)/i;
const EMPTY_TEXT = /^(?:no\b.+|nothing\b.+|you have no\b.+|all caught up\.?$)/i;

function stateNotice(kind, message, actionLabel, action) {
  const notice = document.createElement('section');
  notice.className = `portal-state-notice portal-state-notice--${kind}`;
  notice.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  notice.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
  const text = document.createElement('p');
  text.textContent = message;
  notice.append(text);
  if (actionLabel && action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = actionLabel;
    button.addEventListener('click', action);
    notice.append(button);
  }
  document.body.prepend(notice);
  return notice;
}

function decorateLeaf(element) {
  if (element.children.length) return;
  const text = element.textContent.trim();
  if (LOADING_TEXT.test(text)) {
    element.dataset.state = 'loading';
    element.setAttribute('aria-busy', 'true');
  } else if (element.dataset.state === 'loading') {
    delete element.dataset.state;
    element.removeAttribute('aria-busy');
  }
  const isEmptyResult = element.matches('li, td, .empty, .empty-state')
    || (element.classList.contains('muted') && /^(?:nothing\b|all caught up\.?$)/i.test(text));
  if (EMPTY_TEXT.test(text) && isEmptyResult) {
    if (!element.classList.contains('empty-state')) {
      element.classList.add('empty-state');
      element.dataset.emptyAuto = 'true';
    }
  } else if (element.dataset.emptyAuto === 'true') {
    element.classList.remove('empty-state');
    delete element.dataset.emptyAuto;
  }
}

function decorateSubtree(root) {
  if (!(root instanceof Element)) return;
  decorateLeaf(root);
  root.querySelectorAll('*').forEach(decorateLeaf);
}

function decorateLoadingStates(root = document.body) {
  root.querySelectorAll('*').forEach(decorateLeaf);
}

function draftableFields(form) {
  return [...form.elements].filter((field) => (
    (field.name || field.id) && !field.disabled && !['password', 'file', 'hidden', 'submit', 'button', 'reset'].includes(field.type)
  ));
}

const draftFieldKey = (field) => field.id || field.name;

function draftValue(field) {
  if (field.type === 'checkbox' || field.type === 'radio') return field.checked;
  return field.value;
}

function restoreDrafts(uid) {
  const key = DRAFT_KEY(uid);
  const raw = sessionStorage.getItem(key);
  if (!raw) return;
  const drafts = JSON.parse(raw);
  document.querySelectorAll('form[id]').forEach((form) => {
    const fields = drafts[form.id];
    if (!fields) return;
    draftableFields(form).forEach((field) => {
      const key = draftFieldKey(field);
      if (!(key in fields)) return;
      if (field.type === 'checkbox' || field.type === 'radio') field.checked = fields[key] === true;
      else field.value = fields[key];
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  sessionStorage.removeItem(key);
}

function restoreDraftsWhenReady(uid, onError) {
  const restore = () => {
    try {
      restoreDrafts(uid);
    } catch (error) {
      onError(error);
    }
  };
  if (document.readyState === 'complete') window.setTimeout(restore, 0);
  else window.addEventListener('load', restore, { once: true });
}

function saveDrafts(uid) {
  const drafts = {};
  document.querySelectorAll('form[id]').forEach((form) => {
    const fields = draftableFields(form);
    if (fields.length) drafts[form.id] = Object.fromEntries(fields.map((field) => [draftFieldKey(field), draftValue(field)]));
  });
  if (Object.keys(drafts).length) sessionStorage.setItem(DRAFT_KEY(uid), JSON.stringify(drafts));
}

let activeState = null;

export function mountPortalState({ uid, navigate = (url) => window.location.replace(url) }) {
  activeState?.dispose();

  const offlineNotice = stateNotice('offline', 'You are offline. Your work is saved in this tab where possible; reconnect before retrying.', 'Retry', () => window.location.reload());
  offlineNotice.hidden = navigator.onLine;
  const onOnline = () => { offlineNotice.hidden = true; };
  const onOffline = () => { offlineNotice.hidden = false; };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  const showError = (error) => {
    const code = String(error?.code ?? '').replace(/^firestore\//, '');
    const message = !navigator.onLine || ['unavailable', 'deadline-exceeded', 'network-request-failed'].includes(code)
      ? 'The page could not reach CFL. Reconnect to the internet, then retry.'
      : code === 'permission-denied'
        ? 'Your account could not access this information. Check that you are signed in to the correct account; contact CFL if this continues.'
        : 'The page could not load or save data because something went wrong. Refresh to try again; contact CFL if it keeps happening.';
    stateNotice('error', message, 'Refresh page', () => window.location.reload());
    console.error('Unhandled portal error', error);
  };
  restoreDraftsWhenReady(uid, (error) => {
    stateNotice('error', 'A saved draft could not be restored. Refresh the page; if the draft is still missing, contact CFL support.', 'Refresh page', () => window.location.reload());
    console.error('Could not restore portal form drafts', error);
  });
  const onError = (event) => showError(event.error ?? event.message);
  const onRejection = (event) => showError(event.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === 'characterData') {
        const target = record.target.parentElement;
        if (target) decorateLeaf(target);
      } else if (record.type === 'childList') {
        record.addedNodes.forEach(decorateSubtree);
        if (record.target instanceof Element && !record.target.children.length) decorateLeaf(record.target);
      }
    });
  });
  decorateLoadingStates();
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });

  let sessionWarning;
  let stopLifecycle;
  const persistAndSignOut = async (reason) => {
    if (ending) return;
    ending = true;
    try {
      saveDrafts(uid);
    } catch (error) {
      ending = false;
      stateNotice('error', 'Your unsaved form data could not be saved in this tab. Copy it before signing out, then check your browser storage settings.', 'Try again', () => { void persistAndSignOut(reason); });
      console.error('Could not save portal form drafts', error);
      return;
    }
    const failures = await waitForPendingSaves();
    try {
      await signOutUser();
    } catch (error) {
      ending = false;
      showError(error);
      return;
    }
    navigate(`${ROUTES.login}?reason=${failures.length ? 'session-save-warning' : reason}`);
  };
  let ending = false;
  const showSessionWarning = () => {
    if (sessionWarning) return;
    sessionWarning = stateNotice(
      'warning',
      'Your session will expire in one minute. Continue using the page to stay signed in.',
      'Stay signed in',
      () => window.dispatchEvent(new Event('keydown')),
    );
  };
  stopLifecycle = startSessionLifecycle({
    uid,
    onWarning: showSessionWarning,
    onExpire: () => { void persistAndSignOut('session-expired'); },
  });
  const onActivity = () => {
    sessionWarning?.remove();
    sessionWarning = null;
  };
  const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  activityEvents.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

  activeState = {
    dispose() {
      observer.disconnect();
      stopLifecycle?.();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      activityEvents.forEach((event) => window.removeEventListener(event, onActivity));
      offlineNotice.remove();
    },
    signOut: () => persistAndSignOut('signed-out'),
  };
  return activeState;
}

export function signOutThroughPortal() {
  return activeState?.signOut();
}
