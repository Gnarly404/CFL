import { el, setBusy, setFieldError } from '@/utils/dom.js';
import { formatDate } from '@/utils/format.js';
import {
  OPEN_SERVICE_STATUSES, SERVICE_REQUEST_LABELS, SERVICE_REQUEST_PROMPTS, SERVICE_REQUEST_STATUS_LABELS, validateServiceRequest,
} from '@/utils/service-request-schema.js';
import { listMyServiceRequests, submitServiceRequest } from '@/services/service-request-service.js';

/**
 * "Requests and support": a student sends a request to the Centre from here and follows its status, instead of
 * writing an email that nobody can track. Each button on the card carries data-service-request="<type>".
 */
export function initServiceRequests({
  root = document, uid, loadProgrammes = async () => [], enrolledIds = [],
} = {}) {
  const buttons = [...root.querySelectorAll('[data-service-request]')];
  const list = root.querySelector('#serviceRequestList');
  if (!buttons.length || !list) return { reload() {} };
  let requests = [];
  let current = '';
  let programmes = [];
  const programmeName = (id) => programmes.find((programme) => programme.id === id)?.name ?? '';

  const title = el('h2', { id: 'serviceRequestTitle' }, 'Request');
  const prompt = el('p', { class: 'muted' });
  const alert = el('p', { class: 'form-alert', role: 'alert', 'data-kind': 'error', hidden: true });
  const details = el('textarea', {
    id: 'serviceRequestDetails', class: 'form-control', rows: 5, maxlength: 2000,
  });
  const reference = el('input', {
    id: 'serviceRequestReference', class: 'form-control', type: 'text', maxlength: 60, autocomplete: 'off',
  });
  const programme = el('select', { id: 'serviceRequestProgramme', class: 'form-select' });
  const programmeGroup = el('div', { class: 'form-group' }, el('label', { for: 'serviceRequestProgramme', class: 'form-label' }, 'Programme you want to join'), programme);
  const referenceGroup = el('div', { class: 'form-group' }, el('label', { for: 'serviceRequestReference', class: 'form-label' }, 'Receipt or reference (if you have one)'), reference);
  const submit = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Send request');
  const cancel = el('button', { type: 'button', class: 'btn btn-outline-secondary' }, 'Cancel');
  const form = el('form', { id: 'serviceRequestForm', novalidate: true },
    prompt, alert, programmeGroup,
    el('div', { class: 'form-group' }, el('label', { for: 'serviceRequestDetails', class: 'form-label' }, 'Details'), details),
    referenceGroup,
    el('div', { class: 'service-dialog-actions' }, cancel, submit));
  const dialog = el('dialog', { id: 'serviceRequestDialog', class: 'service-dialog', 'aria-labelledby': 'serviceRequestTitle' }, title, form);
  document.body.append(dialog);
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('mousedown', (event) => { if (event.target === dialog) dialog.close(); });

  function open(type) {
    current = type;
    title.textContent = SERVICE_REQUEST_LABELS[type];
    prompt.textContent = `Tell us: ${SERVICE_REQUEST_PROMPTS[type]}`;
    details.value = '';
    reference.value = '';
    referenceGroup.hidden = type !== 'payment_dispute';
    programmeGroup.hidden = type !== 'new_programme';
    if (type === 'new_programme') {
      const available = programmes.filter((entry) => !enrolledIds.includes(entry.id));
      programme.replaceChildren(el('option', { value: '' }, available.length ? 'Choose a programme…' : 'No other programmes are open right now'),
        ...available.map((entry) => el('option', { value: entry.id }, entry.name)));
    }
    setFieldError(programme, null);
    alert.hidden = true;
    setFieldError(details, null);
    dialog.showModal();
    details.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    const checked = validateServiceRequest({
      requestType: current, details: details.value, reference: reference.value, programmeId: programme.value,
    });
    setFieldError(programme, checked.errors.programmeId ?? null);
    setFieldError(details, checked.errors.details ?? null);
    if (!checked.ok) { (checked.errors.programmeId ? programme : details).focus(); return; }
    setBusy(submit, true, 'Sending…');
    try {
      await submitServiceRequest({
        requestType: current, details: checked.value.details, reference: checked.value.reference, programmeId: checked.value.programmeId,
      });
      dialog.close();
      await reload();
    } catch (error) {
      alert.textContent = error.message || 'That could not be sent. Try again.';
      alert.hidden = false;
    } finally {
      setBusy(submit, false);
    }
  });

  function item(request) {
    const open = OPEN_SERVICE_STATUSES.includes(request.status);
    return el('li', { class: 'service-item', 'data-status': request.status },
      el('div', { class: 'service-item-head' },
        el('strong', {}, SERVICE_REQUEST_LABELS[request.requestType] ?? 'Request', request.programmeId ? `: ${programmeName(request.programmeId) || request.programmeId}` : ''),
        el('span', { class: 'badge-status', 'data-service-status': request.status }, SERVICE_REQUEST_STATUS_LABELS[request.status] ?? request.status),
        el('span', { class: 'muted' }, `Sent ${formatDate(request.createdAt)}`)),
      request.response ? el('p', { class: 'service-reply' }, el('span', { class: 'muted' }, 'The Centre replied: '), request.response) : null,
      request.status === 'needs_student' && request.nextAction ? el('p', { class: 'form-alert', 'data-kind': 'info' }, `What to do next: ${request.nextAction}`) : null,
      open && !request.response ? el('p', { class: 'muted' }, 'The Centre has not replied yet.') : null);
  }

  function render() {
    const openTypes = new Set(requests.filter((request) => OPEN_SERVICE_STATUSES.includes(request.status)).map((request) => request.requestType));
    // A type that is already open cannot be sent twice; its button says so instead of failing later.
    buttons.forEach((button) => {
      // Applying for a programme is not limited to one: the server stops a repeat for the same programme.
      const taken = button.dataset.serviceRequest !== 'new_programme' && openTypes.has(button.dataset.serviceRequest);
      button.disabled = taken;
      button.title = taken ? 'You already have an open request of this kind. See its status below.' : '';
    });
    list.replaceChildren(...(requests.length
      ? [el('h3', { class: 'service-list-title' }, 'Your requests'), el('ul', { class: 'service-list' }, ...requests.slice(0, 20).map(item))]
      : []));
  }

  async function reload() {
    try { requests = await listMyServiceRequests(uid); render(); } catch (error) { console.warn('Could not load service requests', error?.code ?? error); }
  }

  buttons.forEach((button) => button.addEventListener('click', () => open(button.dataset.serviceRequest)));
  loadProgrammes().then((rows) => { programmes = rows; render(); }).catch(() => {});
  reload();
  return { reload, open };
}
