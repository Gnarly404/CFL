import { el, setBusy, setFieldError } from '@/utils/dom.js';
import { formatDate } from '@/utils/format.js';
import {
  OPEN_SERVICE_STATUSES, REVIEW_STATUSES, SERVICE_REQUEST_LABELS, SERVICE_REQUEST_STATUS_LABELS, validateServiceReview,
} from '@/utils/service-request-schema.js';
import { listServiceRequests, updateServiceRequest } from '@/services/service-request-service.js';
import { createDialog } from './dialog.js';

/** The admin side of student requests: a queue, and a dialog to answer one. */
export function initServiceRequests({
  root = document, say, onCount, programmeNameOf = (id) => id,
} = {}) {
  const body = root.querySelector('#serviceRequestsBody');
  if (!body) return { load() {} };
  const filter = root.querySelector('#serviceRequestFilter');
  const status = root.querySelector('#serviceRequestsStatus');
  let requests = [];
  let loaded = false;
  let active = null;

  const lead = el('p', { class: 'muted' });
  const asked = el('blockquote', { class: 'request-asked' });
  const history = el('ul', { class: 'request-history' });
  const alert = el('p', { class: 'form-alert', role: 'alert', 'data-kind': 'error', hidden: true });
  const statusSelect = el('select', { id: 'srv-status', class: 'form-select' },
    ...REVIEW_STATUSES.map((value) => el('option', { value }, SERVICE_REQUEST_STATUS_LABELS[value])));
  const response = el('textarea', {
    id: 'srv-response', class: 'form-control', rows: 4, maxlength: 3000,
  });
  const nextAction = el('input', {
    id: 'srv-next', class: 'form-control', type: 'text', maxlength: 1000, autocomplete: 'off',
  });
  const nextGroup = el('div', { class: 'form-group', hidden: true }, el('label', { for: 'srv-next', class: 'form-label' }, 'What must the student do?'), nextAction);
  const enrol = el('input', { type: 'checkbox', id: 'srv-enrol', checked: true });
  const enrolLabel = el('span', {});
  const enrolGroup = el('div', { class: 'form-group', hidden: true }, el('label', { for: 'srv-enrol', class: 'checkbox-row' }, enrol, enrolLabel),
    el('p', { class: 'hint' }, 'Adds the programme to the student\'s record, starting as "Starting soon". Fees are set separately in Students.'));
  const form = el('form', { id: 'serviceReviewForm', novalidate: true },
    lead, asked, alert,
    el('div', { class: 'form-group' }, el('label', { for: 'srv-status', class: 'form-label' }, 'Status'), statusSelect),
    el('div', { class: 'form-group' }, el('label', { for: 'srv-response', class: 'form-label' }, 'Reply (the student sees this)'), response),
    nextGroup, enrolGroup, history);
  const dialog = createDialog({ id: 'serviceReviewDialog', title: 'Student request', wide: true });
  const save = el('button', { type: 'submit', class: 'btn btn-primary', form: 'serviceReviewForm' }, 'Save reply');
  dialog.body.append(form);
  dialog.footer.append(el('button', { type: 'button', class: 'btn btn-outline-secondary', onclick: () => dialog.close() }, 'Close'), save);
  const syncGroups = () => {
    nextGroup.hidden = statusSelect.value !== 'needs_student';
    enrolGroup.hidden = !(active?.requestType === 'new_programme' && statusSelect.value === 'completed');
  };
  statusSelect.addEventListener('change', syncGroups);

  function openRequest(request) {
    active = request;
    dialog.setTitle(SERVICE_REQUEST_LABELS[request.requestType] ?? 'Student request', request.studentName || request.studentEmail);
    const wants = request.programmeId ? programmeNameOf(request.programmeId) : '';
    lead.textContent = `${request.studentEmail || ''} · sent ${formatDate(request.createdAt)}${request.reference ? ` · reference ${request.reference}` : ''}${wants ? ` · wants to join ${wants}` : ''}`;
    enrolLabel.textContent = `Enrol the student in ${wants || 'this programme'} now`;
    enrol.checked = true;
    asked.textContent = request.details;
    statusSelect.value = request.status === 'submitted' ? 'in_progress' : request.status;
    response.value = request.response ?? '';
    nextAction.value = request.nextAction ?? '';
    syncGroups();
    alert.hidden = true;
    [response, nextAction].forEach((node) => setFieldError(node, null));
    history.replaceChildren(...(request.updates ?? []).slice().reverse().map((entry) => el('li', {},
      el('strong', {}, SERVICE_REQUEST_STATUS_LABELS[entry.status] ?? entry.status), entry.response ? ` — ${entry.response}` : '')));
    dialog.open();
    response.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const checked = validateServiceReview({ status: statusSelect.value, response: response.value, nextAction: nextAction.value });
    setFieldError(response, checked.errors.response ?? null);
    setFieldError(nextAction, checked.errors.nextAction ?? null);
    if (!checked.ok) { (checked.errors.response ? response : nextAction).focus(); return; }
    setBusy(save, true, 'Saving…');
    try {
      const result = await updateServiceRequest({ requestId: active.id, ...checked.value, enrol: checked.enrol && enrol.checked });
      dialog.close();
      say?.(result?.enrolled ? 'Reply saved and the student is enrolled.' : 'Reply saved. The student can see it now.', 'success');
      await load();
    } catch (error) {
      alert.textContent = error.message || 'That could not be saved. Try again.';
      alert.hidden = false;
    } finally {
      setBusy(save, false);
    }
  });

  const shown = () => {
    const want = filter?.value ?? 'open';
    if (want === 'open') return requests.filter((request) => OPEN_SERVICE_STATUSES.includes(request.status));
    return want ? requests.filter((request) => request.status === want) : requests;
  };

  function render() {
    if (!loaded) { body.replaceChildren(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'Loading requests…'))); return; }
    const list = shown();
    body.replaceChildren(...(list.length ? list.map((request) => el('tr', {},
      el('td', {}, el('strong', {}, request.studentName || 'Student'), el('br'), el('small', {}, request.studentEmail || '')),
      el('td', {}, SERVICE_REQUEST_LABELS[request.requestType] ?? request.requestType, request.programmeId ? el('br') : null, request.programmeId ? el('small', {}, programmeNameOf(request.programmeId)) : null),
      el('td', {}, formatDate(request.createdAt)),
      el('td', {}, el('span', { class: 'badge-status', 'data-service-status': request.status }, SERVICE_REQUEST_STATUS_LABELS[request.status] ?? request.status)),
      el('td', { class: 'actions' }, el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', onclick: () => openRequest(request) },
        request.status === 'submitted' ? 'Answer' : 'Open'))))
      : [el('tr', {}, el('td', { colspan: 5, class: 'empty' }, 'No requests here.'))]));
    const open = requests.filter((request) => OPEN_SERVICE_STATUSES.includes(request.status)).length;
    if (status) status.textContent = `${open} open of ${requests.length} requests.`;
    onCount?.(requests.filter((request) => request.status === 'submitted').length);
  }

  async function load() {
    try { requests = await listServiceRequests(); loaded = true; render(); } catch (error) {
      say?.(error.message || 'The student requests could not be loaded.', 'error');
    }
  }
  filter?.addEventListener('change', render);
  render();
  return { load };
}
