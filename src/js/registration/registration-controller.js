import { applicantIsUnder18, STEP_FIELDS } from '@/utils/application-schema.js';
import { submitApplication } from '@/services/application-service.js';
import fallbackProgrammes from '../../data/programmes.json';
import { requestEmailVerification, verifyEmailCode } from '@/services/email-verification-service.js';
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
  nationality: 'Nationality',
  identificationType: 'Identification type',
  identificationNumber: 'Identification number',
  email: 'Email',
  phoneNumber: 'Current phone number',
  residentialAddress: 'Residential address',
  countryOfResidence: 'Country of residence',
  contactName: "Contact person's name",
  contactRelationship: 'Relationship to applicant',
  contactPhone: "Contact person's phone number",
  guardianConsent: 'Parent or legal guardian consent',
  highestQualification: 'Highest relevant previous qualification',
  institutionAttended: 'Institution attended',
  completionYear: 'Completion year',
  programmeId: 'Requested programme',
  consent: 'Applicant confirmation and privacy notice',
};

const DISPLAY = {
  gender: { male: 'Male', female: 'Female', other: 'Other' },
  identificationType: { national_id: 'National ID', passport: 'Passport', birth_certificate: 'Birth certificate' },
  contactRelationship: {
    parent: 'Parent', guardian: 'Guardian', sibling: 'Sibling', other: 'Other',
  },
  highestQualification: {
    none: 'No formal qualification yet', primary: 'Primary school certificate', secondary: 'Secondary school certificate',
    certificate: 'Certificate', diploma: 'Diploma', bachelors: "Bachelor's degree", postgraduate: 'Postgraduate qualification', other: 'Other qualification',
  },
};

const NOT_SAVED = new Set(['consent', 'guardianConsent', 'website']);

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
  requestCode = requestEmailVerification,
  checkCode = verifyEmailCode,
  programmes = fallbackProgrammes,
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
  const programmeField = form.querySelector('[name="programmeId"]');
  const birthDate = form.querySelector('#dateOfBirth');
  const guardianConsentGroup = root.querySelector('#guardianConsentGroup');
  const guardianConsent = form.querySelector('[name="guardianConsent"]');
  const qualificationField = form.querySelector('[name="highestQualification"]');
  const institutionField = form.querySelector('[name="institutionAttended"]');
  const institutionGroup = root.querySelector('#institutionGroup');
  const completionYearField = form.querySelector('[name="completionYear"]');
  const completionYearGroup = root.querySelector('#completionYearGroup');
  const otpVerification = root.querySelector('#otpVerification');
  const otpEmail = root.querySelector('#otpEmail');
  const otpError = root.querySelector('#otpError');
  const otpCode = root.querySelector('#otpCode');
  const verifyOtpButton = root.querySelector('#verifyOtpButton');
  const resendOtpButton = root.querySelector('#resendOtpButton');
  const otpCountdown = root.querySelector('#otpCountdown');
  const changeEmailButton = root.querySelector('#changeEmailButton');
  let current = 0;
  // Only timing information lives here. The code itself is created, stored and checked on the server.
  let otpSession = null;
  let verifiedEmail = '';
  let shownStep = null;

  // A programme can be chosen before arriving here: /register?programme=general-english
  const programme = new URLSearchParams(search).get('programme') ?? '';
  if (programmeField?.tagName === 'SELECT') {
    const placeholder = programmeField.querySelector('option');
    programmeField.replaceChildren(...(placeholder ? [placeholder] : []));
    const seen = new Set();
    for (const entry of programmes) {
      if (!entry?.id || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(entry.id) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name || entry.id;
      programmeField.append(option);
    }
    if (programme && seen.has(programme)) programmeField.value = programme;
  } else if (programmeField && /^[a-z0-9][a-z0-9-]{0,59}$/.test(programme)) programmeField.value = programme;

  // No future birth dates or completion years in the form.
  if (birthDate) birthDate.max = now().toISOString().slice(0, 10);
  if (completionYearField) completionYearField.max = String(now().getUTCFullYear());

  function updateConditionalFields() {
    const under18 = applicantIsUnder18(birthDate?.value, now());
    if (guardianConsentGroup) guardianConsentGroup.hidden = !under18;
    if (guardianConsent) {
      guardianConsent.required = under18;
      if (!under18) guardianConsent.checked = false;
    }
    const noQualification = qualificationField?.value === 'none';
    if (institutionGroup) institutionGroup.hidden = Boolean(noQualification);
    if (completionYearGroup) completionYearGroup.hidden = Boolean(noQualification);
    if (institutionField) institutionField.required = !noQualification;
    if (completionYearField) completionYearField.required = !noQualification;
    root.querySelectorAll('[data-required-for]').forEach((mark) => { mark.hidden = Boolean(noQualification); });
  }
  birthDate?.addEventListener('input', updateConditionalFields);
  birthDate?.addEventListener('change', updateConditionalFields);
  qualificationField?.addEventListener('change', updateConditionalFields);
  updateConditionalFields();

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
    // Let the page chrome (step list, motion) follow along without the controller knowing about either.
    const previous = shownStep;
    shownStep = current;
    form.dispatchEvent(new CustomEvent('cfl:step', { bubbles: true, detail: { index: current, previous, total: steps.length } }));
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
    const names = Object.keys(LABELS).filter((name) => name !== 'guardianConsent' || applicantIsUnder18(data.dateOfBirth, now()));
    reviewList.replaceChildren(...names.flatMap((name) => {
      const raw = data[name] ?? '';
      let text = DISPLAY[name]?.[raw] ?? raw;
      if (name === 'identificationNumber' && raw) text = `Ending ${String(raw).replace(/\s/g, '').slice(-4)}`;
      if (name === 'programmeId') text = programmeField?.selectedOptions[0]?.textContent ?? raw;
      if (name === 'consent' || name === 'guardianConsent') text = raw === true ? 'Confirmed' : '—';
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

  const secondsLeft = (timestamp) => Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));

  function showOtpError(reason, fallback = '') {
    const messages = {
      missing: 'Your verification session could not be found. Please request a new code.',
      expired: 'This code has expired. Please request a new code.',
      invalid: 'That verification code is incorrect.',
      'too-many-attempts': 'Too many incorrect attempts. Please request a new code.',
    };
    otpError.textContent = messages[reason] || fallback || 'Something went wrong. Please try again.';
  }

  function startResendCountdown() {
    const session = otpSession;
    if (!session || !otpCountdown || !resendOtpButton) return;

    resendOtpButton.disabled = true;
    let intervalId;
    const tick = () => {
      const seconds = otpSession ? secondsLeft(otpSession.resendAvailableAt) : 0;
      if (seconds <= 0) {
        clearInterval(intervalId);
        otpCountdown.textContent = 'You can request another code.';
        resendOtpButton.disabled = false;
        return;
      }
      otpCountdown.textContent = `You can request another code in ${seconds} seconds.`;
    };

    tick();
    intervalId = window.setInterval(tick, 1000);
  }

  function openOtpVerification(email, name) {
    if (!otpVerification || !otpEmail || !otpCode || !otpCountdown || !resendOtpButton) return;

    otpEmail.textContent = email;
    otpError.textContent = '';
    otpCode.value = '';
    otpCode.focus();
    form.hidden = true;
    otpVerification.classList.remove('hidden');
    startResendCountdown();
    formError.hidden = true;
    formError.textContent = '';
    if (name) {
      form.querySelector('[name="firstName"]')?.setAttribute('data-otp-name', name);
    }
  }

  function returnToRegistration() {
    if (!otpVerification) return;
    otpVerification.classList.add('hidden');
    form.hidden = false;
    const emailField = form.querySelector('#email');
    emailField?.focus();
    showMessage(formError, 'You can update the email and request a new verification code.', 'info');
  }

  function showOtpExpired() {
    otpError.textContent = 'This code has expired. Please request a new code.';
    resendOtpButton.disabled = false;
    otpCountdown.textContent = 'You can request another code.';
  }

  // ---- draft recovery
  const saveDraft = debounce(() => {
    const data = collectFormData(form);
    for (const key of NOT_SAVED) delete data[key];
    store.save(data, current);
  }, 400);

  const storedDraft = store.load();
  const legacyDraft = storedDraft && Object.hasOwn(storedDraft.data, 'guardianName');
  const draft = storedDraft ? {
    ...storedDraft,
    data: legacyDraft ? {
      ...storedDraft.data,
      contactName: storedDraft.data.guardianName || storedDraft.data.emergencyContact || '',
      contactRelationship: storedDraft.data.relationship || '',
      contactPhone: storedDraft.data.guardianPhone || '',
    } : storedDraft.data,
    step: legacyDraft ? [0, 2, 4, 5][Math.min(storedDraft.step, 3)] : storedDraft.step,
  } : null;
  if (draft) {
    for (const [name, value] of Object.entries(draft.data)) {
      const fields = fieldsNamed(name);
      if (name === 'gender') fields.forEach((field) => { field.checked = field.value === value; });
      else if (fields[0] && typeof value === 'string') fields[0].value = value;
    }
    showMessage(draftNotice, 'We restored the details you had started. They are kept on this device for 7 days.', 'info');
  }
  updateConditionalFields();
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

  /**
   * Sends the application. The server refuses it unless the address was verified there, so
   * `verifiedEmail` below is only a hint that saves the applicant a second code after a failed send.
   */
  async function sendApplication(busyButton, { direct = false } = {}) {
    try {
      const payload = { ...collectFormData(form), website: form.querySelector('[name="website"]')?.value ?? '' };
      const { reference } = await submit(payload);
      store.clear();
      verifiedEmail = '';
      form.hidden = true;
      otpVerification?.classList.add('hidden');
      root.querySelector('.progress-container')?.setAttribute('hidden', '');
      root.querySelector('#referenceNumber').textContent = reference;
      confirmation.hidden = false;
      confirmation.querySelector('h2')?.focus();
      return 'sent';
    } catch (error) {
      if (error.details?.reason === 'email-not-verified') {
        verifiedEmail = '';
        if (direct) {
          setBusy(busyButton, false);
          return 'needs-verification';
        }
      }
      if (error.fieldErrors) {
        const bad = firstStepWithError(error.fieldErrors);
        if (bad >= 0) {
          showStep(bad);
          showErrors(error.fieldErrors, STEP_FIELDS[bad]);
        }
      }
      showMessage(formError, error.message || 'We could not send your application. Please try again.', 'error');
      otpVerification?.classList.add('hidden');
      form.hidden = false;
      setBusy(busyButton, false);
      return 'failed';
    }
  }

  verifyOtpButton?.addEventListener('click', async () => {
    const enteredCode = otpCode?.value.trim() ?? '';

    if (!otpSession) {
      showOtpError('missing');
      return;
    }

    if (Date.now() > otpSession.expiresAt) {
      otpSession = null;
      showOtpExpired();
      return;
    }

    setBusy(verifyOtpButton, true, 'Verifying your email…');
    try {
      await checkCode({ email: otpSession.email, code: enteredCode });
    } catch (error) {
      const reason = error?.details?.reason;
      if (reason === 'expired' || reason === 'missing' || reason === 'too-many-attempts') {
        otpSession = null;
        if (resendOtpButton) resendOtpButton.disabled = false;
        if (otpCountdown) otpCountdown.textContent = 'You can request another code.';
      }
      showOtpError(reason, error?.message);
      setBusy(verifyOtpButton, false);
      return;
    }

    verifiedEmail = otpSession.email;
    otpSession = null;
    await sendApplication(verifyOtpButton);
  });

  resendOtpButton?.addEventListener('click', async () => {
    if (!otpSession || secondsLeft(otpSession.resendAvailableAt) > 0) return;

    const email = otpSession.email;
    const name = [form.querySelector('#firstName')?.value.trim(), form.querySelector('#surname')?.value.trim()].filter(Boolean).join(' ');
    try {
      const { expiresAt, resendAvailableAt } = await requestCode({ email, name });
      otpSession = { email, expiresAt, resendAvailableAt };
      startResendCountdown();
      otpError.textContent = '';
    } catch (error) {
      showOtpError(error?.details?.reason, error?.message || 'We could not send a new verification code. Please try again.');
    }
  });

  changeEmailButton?.addEventListener('click', () => {
    otpSession = null;
    returnToRegistration();
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

    const email = form.querySelector('#email')?.value.trim() ?? '';
    const name = [form.querySelector('#firstName')?.value.trim(), form.querySelector('#surname')?.value.trim()].filter(Boolean).join(' ');

    setBusy(submitButton, true, 'Sending your application…');
    if (verifiedEmail && verifiedEmail === email) {
      const outcome = await sendApplication(submitButton, { direct: true });
      if (outcome !== 'needs-verification') return;
      setBusy(submitButton, true, 'Sending your application…');
    }
    try {
      const { expiresAt, resendAvailableAt } = await requestCode({ email, name });
      otpSession = { email, expiresAt, resendAvailableAt };
      openOtpVerification(email, name);
      setBusy(submitButton, false);
    } catch (error) {
      if (error.fieldErrors) {
        const bad = firstStepWithError(error.fieldErrors);
        if (bad >= 0) {
          showStep(bad);
          showErrors(error.fieldErrors, STEP_FIELDS[bad]);
        }
      }
      showMessage(formError, error.message || 'We could not send the verification code. Please try again.', 'error');
      setBusy(submitButton, false);
    }
  });

  return { get step() { return current; }, showStep };
}
