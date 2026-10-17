import { ROLE_LABELS, ROLES } from '@/utils/roles.js';
import {
  availableDecisions, DECISION_LABELS, STATUS_LABELS,
} from '@/utils/application-status.js';
import { initAssignments } from './assignments.js';
import { initProgrammeStaff } from './programme-staff.js';
import { initProgrammes } from './programmes.js';
import { initRecords } from './records.js';
import { applicationDetails } from './application-details.js';
import { setAttentionBadge } from '@/ui/attention-badge.js';
import { icon } from '@/ui/icons.js';
import { setStat } from './stats.js';
import { validateEmail, validateName } from '@/utils/validation.js';
import { formatDate } from '@/utils/format.js';
import {
  el, setBusy, setFieldError, showMessage,
} from '@/utils/dom.js';
import {
  countOpenApplications, createUser, decideApplication, listApplications, listPrivacyRequests, listUsers,
  resendInvite, reviewPrivacyRequest, deleteDeclinedPrivacyRequest, deleteRejectedApplication, setUserDisabled, setUserRole,
} from '@/services/admin-service.js';
import { sendAccountInvitation } from '@/services/email.js';
import { deliverInvitation as deliverInvitationTo } from './invitation.js';

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
  const privacyRequestsList = root.querySelector('#privacyRequestsList');
  const privacyRequestFilter = root.querySelector('#privacyRequestFilter');
  const createForm = root.querySelector('#createUserForm');

  let knownUsers = [];
  const say = (text, kind = 'info') => {
    showMessage(message, text, kind);
    message?.scrollIntoView?.({ block: 'nearest' });
  };

  async function updateApplicationAttention() {
    try {
      const open = await countOpenApplications();
      setAttentionBadge('applications', open, root);
      setStat('openApplications', open, root);
    } catch (error) {
      console.warn('Could not load pending application count', error?.code ?? error);
    }
  }

  const assignments = initAssignments({ root, say, getUsers: () => knownUsers });
  const programmeStaff = initProgrammeStaff({ root, say, getUsers: () => knownUsers });
  const records = initRecords({ root, say });
  const programmes = initProgrammes({
    root,
    say,
    onChange: () => programmeStaff.load(),
    onLoad: (rows) => {
      setStat('programmes', rows.filter((programme) => programme.active !== false).length, root);
      records.store.setProgrammes(rows);
    },
  });

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

  const deliverInvitation = (result, person) => deliverInvitationTo(result, person, { send: sendAccountInvitation, say });

  const statusBadge = (status) => el('span', { class: `badge-status badge-${status}` }, STATUS_LABELS[status] ?? status);

  function applicationRow(app) {
    const actions = availableDecisions(app.status).map((decision) => el('button', {
      type: 'button',
      class: `btn btn-sm ${decision === 'approve' ? 'btn-primary' : 'btn-outline-secondary'}`,
      onclick: async () => {
        if (CONFIRM[decision] && !window.confirm(CONFIRM[decision])) return;

        const result = await run(
          DECISION_LABELS[decision],
          () => decideApplication({
            applicationId: app.id,
            decision,
          }),
        );

        if (decision === 'approve' && result) {
          await deliverInvitation(result, {
            email: app.email,
            displayName: app.applicantName,
            role: 'student',
          });
        }
      },
    }, DECISION_LABELS[decision]));
        if (app.status === 'rejected') {
          actions.push(el('button', {
            type: 'button',
            class: 'application-delete-button',
            title: 'Permanently delete declined application',
            'aria-label': `Permanently delete declined application ${app.reference}`,
            onclick: async () => {
              if (!window.confirm(`Permanently delete declined application ${app.reference}? This cannot be undone.`)) return;
              await run('Application permanently deleted', () => deleteRejectedApplication({ applicationId: app.id }));
            },
          }, icon('trash', { size: 18 })));
        }
    return el('tr', {},
      el('td', {}, app.reference),
      el('td', {}, el('strong', {}, app.applicantName), el('br'), el('small', {}, app.email), applicationDetails(app)),
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
        onclick: async () => {
          const result = await run(
            'Invitation prepared',
            () => resendInvite({ uid: user.uid }),
            { reload: [] },
          );

          if (result) {
            await deliverInvitation(result, {
              email: user.email,
              displayName: user.displayName,
              role: user.role,
            });
          }
        },
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

  const privacyRequestTypes = {
    data_access: 'Request my data', correction: 'Request a correction', deletion: 'Request deletion',
    objection: 'Object to data processing', restriction: 'Restrict data processing',
  };
  const privacyRequestStatuses = {
    submitted: 'Submitted', under_review: 'Under review', needs_student: 'Action needed', completed: 'Completed', declined: 'Closed',
  };
  const privacyRequestDate = (value) => {
    const date = value?.toDate?.() ?? (value ? new Date(value) : null);
    return date && !Number.isNaN(date.getTime()) ? formatDate(date) : 'Date unavailable';
  };

  function privacyRequestItem(request) {
    const summary = el('summary', {},
      el('div', {},
        el('strong', {}, privacyRequestTypes[request.requestType] ?? 'Privacy request'),
        el('span', { class: 'privacy-review-meta' }, `${request.studentEmail ?? request.studentId} · ${privacyRequestDate(request.createdAt)}`)),
      el('span', { class: 'badge-status', 'data-status': request.status }, privacyRequestStatuses[request.status] ?? request.status));
    const response = el('textarea', { class: 'form-control', rows: 3, maxlength: '3000', 'aria-label': 'CFL response' }, request.response ?? '');
    const nextAction = el('textarea', { class: 'form-control', rows: 2, maxlength: '1000', 'aria-label': 'Required student action' }, request.nextAction ?? '');
    const nextActionGroup = el('label', { class: 'privacy-review-field' }, 'What must the student do next?', nextAction);
    const status = el('select', { class: 'form-select', 'aria-label': 'Privacy request status' },
      ...['under_review', 'needs_student', 'completed', 'declined'].map((value) => el('option', { value, selected: value === (request.status === 'submitted' ? 'under_review' : request.status) }, privacyRequestStatuses[value])));
    const updateConditionalAction = () => {
      const required = status.value === 'needs_student';
      nextActionGroup.hidden = !required;
      nextAction.required = required;
    };
    status.addEventListener('change', updateConditionalAction);
    updateConditionalAction();

    const form = el('form', { class: 'privacy-review-form' },
      el('div', { class: 'privacy-review-fields' },
        el('label', { class: 'privacy-review-field' }, 'Review status', status),
        el('label', { class: 'privacy-review-field' }, 'Response to student', response),
        nextActionGroup),
      el('div', { class: 'privacy-review-actions' },
        el('span', { class: 'privacy-review-meta' }, `Request ${request.id}`),
        el('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Save review')));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (status.value !== 'under_review' && response.value.trim().length < 3) {
        response.setCustomValidity('Add a response before closing or requesting more information.');
        response.reportValidity();
        response.addEventListener('input', () => response.setCustomValidity(''), { once: true });
        return;
      }
      if (!form.reportValidity()) return;
      const button = form.querySelector('button[type="submit"]');
      setBusy(button, true, 'Saving…');
      try {
        await reviewPrivacyRequest({ requestId: request.id, status: status.value, response: response.value, nextAction: nextAction.value });
        say('Privacy request review saved.', 'success');
        await loadPrivacyQueue();
      } catch (error) {
        say(error.message || 'The privacy request could not be updated.', 'error');
        setBusy(button, false);
      }
    });
    const deleteButton = request.status === 'declined' ? el('button', {
      type: 'button',
      class: 'privacy-delete-button',
      title: 'Permanently delete declined request',
      'aria-label': `Permanently delete declined privacy request ${request.id.slice(0, 8)}`,
      onclick: async () => {
        if (!window.confirm(`Permanently delete declined privacy request ${request.id.slice(0, 8)}? This cannot be undone.`)) return;
        deleteButton.disabled = true;
        try {
          await deleteDeclinedPrivacyRequest({ requestId: request.id });
          say('Declined privacy request permanently deleted.', 'success');
          await loadPrivacyQueue();
        } catch (error) {
          say(error.message || 'The privacy request could not be deleted.', 'error');
          deleteButton.disabled = false;
        }
      },
    }, icon('trash', { size: 18 })) : '';

    const item = el('details', { class: `privacy-review-item${request.status === 'declined' ? ' is-declined' : ''}` }, summary,
      deleteButton,
      el('div', { class: 'privacy-review-content' },
        el('p', {}, el('strong', {}, 'Student request: '), request.details || 'Copy of personal data requested.'),
        request.correctionCategory ? el('p', {}, el('strong', {}, 'Correction category: '), request.correctionCategory.replaceAll('_', ' ')) : '',
        request.response ? el('p', {}, el('strong', {}, 'Previous response: '), request.response) : '',
        form));
    return item;
  }

  async function loadPrivacyQueue() {
    if (!privacyRequestsList) return;
    privacyRequestsList.replaceChildren(el('p', { class: 'text-secondary' }, 'Loading privacy requests…'));
    try {
      const requests = await listPrivacyRequests();
      setStat('privacyOpen', requests.filter((request) => ['submitted', 'under_review'].includes(request.status)).length, root);
      const status = privacyRequestFilter?.value ?? '';
      const filtered = requests.filter((request) => !status || request.status === status);
      privacyRequestsList.replaceChildren(...(filtered.length
        ? filtered.map(privacyRequestItem)
        : [el('p', { class: 'privacy-review-empty' }, 'No privacy requests match this filter.')]));
    } catch (error) {
      privacyRequestsList.replaceChildren(el('p', { class: 'text-danger' }, error.message || 'Privacy requests could not be loaded.'));
    }
  }

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
    await updateApplicationAttention();
  }

  async function loadUsers() {
    usersBody.replaceChildren(emptyRow(5, 'Loading accounts…'));
    try {
      const users = await listUsers();
      knownUsers = users;
      setStat('students', users.filter((user) => user.role === 'student' && user.status !== 'disabled').length, root);
      setStat('instructors', users.filter((user) => user.role === 'instructor' && user.status !== 'disabled').length, root);
      usersBody.replaceChildren(...(users.length ? users.map(userRow) : [emptyRow(5, 'No accounts yet.')]));
    } catch (error) {
      usersBody.replaceChildren(emptyRow(5, 'Accounts could not be loaded.'));
      say(error.message || 'Accounts could not be loaded.', 'error');
      return;
    }
    assignments.load();
    programmeStaff.load();
    programmes.load();
  }

  filter?.addEventListener('change', loadApplications);
  privacyRequestFilter?.addEventListener('change', loadPrivacyQueue);
  root.querySelector('#refreshPrivacyQueue')?.addEventListener('click', loadPrivacyQueue);
  root.querySelector('#refreshAll')?.addEventListener('click', () => { loadApplications(); loadUsers(); programmes.load(); loadPrivacyQueue(); records.reload(); });

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
    const result = await run(
      'Account created',
      () => createUser({
        email: email.value.trim(),
        displayName: name.value.trim(),
        role: role.value,
      }),
      { reload: ['users'] },
    );
    setBusy(button, false);
    if (result) {
      const invitationSent = await deliverInvitation(result, {
        email: email.value.trim(),
        displayName: name.value.trim(),
        role: role.value,
      });

      createForm.reset();

      if (invitationSent && result.activationUrl) {
        say(
          `Account created and invitation sent. Local activation link: ${result.activationUrl}`,
          'success',
        );
      }
    }
  });

  loadApplications();
  loadUsers();
  loadPrivacyQueue();
}
