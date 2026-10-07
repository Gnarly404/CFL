import { ROLE_LABELS, ROLES } from '@/utils/roles.js';
import {
  availableDecisions, DECISION_LABELS, STATUS_LABELS,
} from '@/utils/application-status.js';
import { validateEmail, validateName } from '@/utils/validation.js';
import { formatDate } from '@/utils/format.js';
import {
  el, setBusy, setFieldError, showMessage,
} from '@/utils/dom.js';
import {
  createUser, decideApplication, listApplications, listUsers, resendInvite, setUserDisabled, setUserRole,
} from '@/services/admin-service.js';

const CONFIRM = {
  approve: 'Approve this application? A student account is created and an invitation email is sent.',
  reject: 'Decline this application? The applicant is notified.',
};

/** Admin console: admissions queue, account creation and account management. */
export function initAdminDashboard({ currentUid, root = document } = {}) {
  const message = root.querySelector('#adminMessage');
  const appsBody = root.querySelector('#applicationsBody');
  const usersBody = root.querySelector('#usersBody');
  const filter = root.querySelector('#applicationFilter');
  const createForm = root.querySelector('#createUserForm');

  const say = (text, kind = 'info') => {
    showMessage(message, text, kind);
    message?.scrollIntoView?.({ block: 'nearest' });
  };

  async function run(label, work, { reload = ['applications', 'users'] } = {}) {
    try {
      const result = await work();
      say(`${label} done.`, 'success');
      if (reload.includes('applications')) await loadApplications();
      if (reload.includes('users')) await loadUsers();
      return result;
    } catch (error) {
      say(error.message || 'That did not work. Try again.', 'error');
      return null;
    }
  }

  const statusBadge = (status) => el('span', { class: `badge-status badge-${status}` }, STATUS_LABELS[status] ?? status);

  function applicationRow(app) {
    const actions = availableDecisions(app.status).map((decision) => el('button', {
      type: 'button',
      class: `btn btn-sm ${decision === 'approve' ? 'btn-primary' : 'btn-outline-secondary'}`,
      onclick: async () => {
        if (CONFIRM[decision] && !window.confirm(CONFIRM[decision])) return;
        await run(DECISION_LABELS[decision], () => decideApplication({ applicationId: app.id, decision }));
      },
    }, DECISION_LABELS[decision]));
    return el('tr', {},
      el('td', {}, app.reference),
      el('td', {}, el('strong', {}, app.applicantName), el('br'), el('small', {}, app.email)),
      el('td', {}, app.programmeId ?? '—'),
      el('td', {}, formatDate(app.createdAt)),
      el('td', {}, statusBadge(app.status)),
      el('td', { class: 'actions' }, actions.length ? actions : '—'));
  }

  function userRow(user) {
    const isSelf = user.uid === currentUid;
    const roleSelect = el('select', {
      class: 'form-select form-select-sm',
      'aria-label': `Role for ${user.email}`,
      disabled: isSelf,
      onchange: async (event) => {
        const role = event.target.value;
        if (!window.confirm(`Change ${user.email} to ${ROLE_LABELS[role]}? They will need to sign in again.`)) {
          event.target.value = user.role;
          return;
        }
        await run('Role change', () => setUserRole({ uid: user.uid, role }), { reload: ['users'] });
      },
    }, ROLES.map((role) => el('option', { value: role, selected: role === user.role }, ROLE_LABELS[role])));

    const actions = [];
    if (!isSelf) {
      const disabled = user.status === 'disabled';
      actions.push(el('button', {
        type: 'button',
        class: 'btn btn-sm btn-outline-secondary',
        onclick: async () => {
          if (!disabled && !window.confirm(`Disable ${user.email}? They are signed out immediately.`)) return;
          await run(disabled ? 'Enable account' : 'Disable account', () => setUserDisabled({ uid: user.uid, disabled: !disabled }), { reload: ['users'] });
        },
      }, disabled ? 'Enable' : 'Disable'));
    }
    if (user.status === 'invited') {
      actions.push(el('button', {
        type: 'button',
        class: 'btn btn-sm btn-outline-secondary',
        onclick: () => run('Invitation sent', () => resendInvite({ uid: user.uid }), { reload: [] }),
      }, 'Resend invitation'));
    }
    return el('tr', {},
      el('td', {}, el('strong', {}, user.displayName ?? '—'), el('br'), el('small', {}, user.email)),
      el('td', {}, roleSelect),
      el('td', {}, el('span', { class: `badge-status badge-${user.status}` }, user.status)),
      el('td', {}, formatDate(user.createdAt)),
      el('td', { class: 'actions' }, actions.length ? actions : '—'));
  }

  const emptyRow = (cols, text) => el('tr', {}, el('td', { colspan: cols, class: 'empty' }, text));

  async function loadApplications() {
    appsBody.replaceChildren(emptyRow(6, 'Loading applications…'));
    try {
      const status = filter?.value || null;
      const apps = await listApplications({ status });
      appsBody.replaceChildren(...(apps.length ? apps.map(applicationRow) : [emptyRow(6, 'No applications match this filter.')]));
    } catch (error) {
      appsBody.replaceChildren(emptyRow(6, 'Applications could not be loaded.'));
      say(error.message || 'Applications could not be loaded.', 'error');
    }
  }

  async function loadUsers() {
    usersBody.replaceChildren(emptyRow(5, 'Loading accounts…'));
    try {
      const users = await listUsers();
      usersBody.replaceChildren(...(users.length ? users.map(userRow) : [emptyRow(5, 'No accounts yet.')]));
    } catch (error) {
      usersBody.replaceChildren(emptyRow(5, 'Accounts could not be loaded.'));
      say(error.message || 'Accounts could not be loaded.', 'error');
    }
  }

  filter?.addEventListener('change', loadApplications);
  root.querySelector('#refreshAll')?.addEventListener('click', () => { loadApplications(); loadUsers(); });

  createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = createForm.querySelector('#newEmail');
    const name = createForm.querySelector('#newName');
    const role = createForm.querySelector('#newRole');
    const emailError = validateEmail(email.value);
    const nameError = validateName(name.value, { label: 'Name' });
    setFieldError(email, emailError);
    setFieldError(name, nameError);
    if (emailError || nameError) return;

    const button = createForm.querySelector('button[type="submit"]');
    setBusy(button, true, 'Creating…');
    const result = await run('Account created', () => createUser({
      email: email.value.trim(), displayName: name.value.trim(), role: role.value,
    }), { reload: ['users'] });
    setBusy(button, false);
    if (result) {
      createForm.reset();
      if (result.activationUrl) say(`Account created. Local emulator activation link: ${result.activationUrl}`, 'success');
    }
  });

  loadApplications();
  loadUsers();
}
