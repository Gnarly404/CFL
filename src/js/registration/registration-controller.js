import { STEP_FIELDS } from '@/utils/application-schema.js';
import { submitApplication } from '@/services/application-service.js';
import {
  debounce, el, setBusy, setFieldError, showMessage,
} from '@/utils/dom.js';
import { createDraftStore } from './registration-storage.js';
import {
  collectFormData, firstStepWithError, validateAll, validateStep,
} from './registration-validation.js';

const LABELS = {
  firstName: 'First name',
  middleName: 'Middle name',
  surname: 'Surname',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  email: 'Email',
  phoneNumber: 'Phone number',
  nationality: 'Nationality',
  guardianName: 'Guardian name',
  relationship: 'Relationship',
  guardianPhone: "Guardian's phone",
  emergencyContact: 'Emergency contact',
};

const DISPLAY = {
  gender: { male: 'Male', female: 'Female', other: 'Other' },
  nationality: { kenyan: 'Kenyan', other: 'Other' },
  relationship: {
    parent: 'Parent', guardian: 'Guardian', sibling: 'Sibling', other: 'Other',
  },
};

const NOT_SAVED = new Set(['consent', 'website', 'programmeId']);

/**
 * One controller for the whole application form: step navigation, validation, draft recovery,
 * review, submission and confirmation. Collaborators are injectable for tests.
 */
export function initRegistration({
  root = document,
  search = window.location.search,
  submit = submitApplication,
  store = createDraftStore(),
  now = () => new Date(),
} = {}) {
  const form = root.querySelector('#registrationForm');
  if (!form) return null;

  const steps = [...form.querySelectorAll('.step')];
  const prev = form.querySelector('.btn-prev');
  const next = form.querySelector('.btn-next');
  const submitButton = form.querySelector('.btn-submit');
  const bar = root.querySelector('#profileProgress');
  const percent = root.querySelector('.progress-percentage');
  const formError = root.querySelector('#formError');
  const draftNotice = root.querySelector('#draftNotice');
  const confirmation = root.querySelector('#confirmation');
  const reviewList = root.querySelector('#reviewList');
  let current = 0;

  // A programme can be chosen before arriving here: /register?programme=general-english
  const programme = new URLSearchParams(search).get('programme') ?? '';
  const programmeField = form.querySelector('[name="programmeId"]');
  if (programmeField && /^[a-z0-9][a-z0-9-]{0,59}$/.test(programme)) programmeField.value = programme;

  // No future birth dates in the date picker.
  const birthDate = form.querySelector('#dateOfBirth');
  if (birthDate) birthDate.max = now().toISOString().slice(0, 10);

  const fieldsNamed = (name) => [...form.querySelectorAll(`[name="${name}"]`)];

  function showErrors(errors, fields) {
    for (const name of fields) {
      const [first] = fieldsNamed(name);
      if (first) setFieldError(first, errors[name] ?? null);
    }
  }

  function showStep(index) {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, i) => step.classList.toggle('active', i === current));
    if (prev) prev.disabled = current === 0;
    if (next) next.hidden = current === steps.length - 1;
    if (submitButton) submitButton.hidden = current !== steps.length - 1;
    const progress = Math.round((current / (steps.length - 1)) * 100);
    if (bar) bar.style.width = `${progress}%`;
    if (percent) percent.textContent = `${progress}%`;
    if (current === steps.length - 1) renderReview();
  }

  // Move keyboard and screen-reader focus to the new step without letting the browser scroll the page sideways.
  function focusStep() {
    const heading = steps[current].querySelector('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (root.querySelector('.progress-container') ?? form).scrollIntoView?.({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  }

  function renderReview() {
    if (!reviewList) return;
    const data = collectFormData(form);
    reviewList.replaceChildren(...Object.keys(LABELS).flatMap((name) => {
      const raw = data[name] ?? '';
      const text = DISPLAY[name]?.[raw] ?? raw;
      return [el('dt', {}, LABELS[name]), el('dd', {}, text || '—')];
    }));
  }

  function validateCurrent() {
    const errors = validateStep(collectFormData(form), current, now());
    showErrors(errors, STEP_FIELDS[current]);
    const [firstBad] = STEP_FIELDS[current].filter((name) => errors[name]);
    if (firstBad) fieldsNamed(firstBad)[0]?.focus();
    return Object.keys(errors).length === 0;
  }

  // ---- draft recovery
  const saveDraft = debounce(() => {
    const data = collectFormData(form);
    for (const key of NOT_SAVED) delete data[key];
    store.save(data, current);
  }, 400);

  const draft = store.load();
  if (draft) {
    for (const [name, value] of Object.entries(draft.data)) {
      const fields = fieldsNamed(name);
      if (name === 'gender') fields.forEach((field) => { field.checked = field.value === value; });
      else if (fields[0] && typeof value === 'string') fields[0].value = value;
    }
    showMessage(draftNotice, 'We restored the details you had started. They are kept on this device for 7 days.', 'info');
  }
  showStep(draft ? draft.step : 0);

  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);

  next?.addEventListener('click', () => {
    if (!validateCurrent()) return;
    showStep(current + 1);
    focusStep();
  });
  prev?.addEventListener('click', () => {
    showStep(current - 1);
    focusStep();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(formError, '');
    const result = validateAll(collectFormData(form), now());
    if (!result.ok) {
      const bad = firstStepWithError(result.errors);
      if (bad >= 0) {
        showStep(bad);
        showErrors(result.errors, STEP_FIELDS[bad]);
        fieldsNamed(STEP_FIELDS[bad].find((name) => result.errors[name]))[0]?.focus();
      }
      return;
    }

    setBusy(submitButton, true, 'Sending your application…');
    try {
      const payload = { ...collectFormData(form), website: form.querySelector('[name="website"]')?.value ?? '' };
      const { reference } = await submit(payload);
      store.clear();
      form.hidden = true;
      root.querySelector('.progress-container')?.setAttribute('hidden', '');
      root.querySelector('#referenceNumber').textContent = reference;
      confirmation.hidden = false;
      confirmation.querySelector('h2')?.focus();
    } catch (error) {
      if (error.fieldErrors) {
        const bad = firstStepWithError(error.fieldErrors);
        if (bad >= 0) {
          showStep(bad);
          showErrors(error.fieldErrors, STEP_FIELDS[bad]);
        }
      }
      showMessage(formError, error.message || 'We could not send your application. Please try again.', 'error');
      setBusy(submitButton, false);
    }
  });

  return { get step() { return current; }, showStep };
}
