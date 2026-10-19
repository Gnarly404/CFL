// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initRegistration } from '@/registration/registration-controller.js';
import { fill, loadPage, tick } from '../helpers.js';

const NOW = new Date('2026-10-06T12:00:00Z');
const step1 = { firstName: 'Wanjiku', surname: 'Kamau', dateOfBirth: '2012-05-14' };
const step2 = { gender: 'female', nationality: 'Kenyan' };
const step3 = { identificationType: 'national_id', identificationNumber: '12345678' };
const step4 = { email: 'parent@example.com', phoneNumber: '0712345678', residentialAddress: '12 Valley Road, Nairobi', countryOfResidence: 'Kenya' };
const step5 = { contactName: 'Grace Kamau', contactRelationship: 'parent', contactPhone: '0722000111', guardianConsent: true };
const step6 = { highestQualification: 'secondary', institutionAttended: 'Nairobi School', completionYear: '2020', programmeId: 'english-intake' };

function memoryStore(initial = null) {
  let draft = initial;
  return {
    save: vi.fn((data, step) => { draft = { data, step }; }),
    load: () => draft,
    clear: vi.fn(() => { draft = null; }),
  };
}

const rejection = (reason, message) => Object.assign(new Error(message), { code: 'invalid-argument', details: { reason } });
const freshCode = () => vi.fn(async () => ({ expiresAt: Date.now() + 10 * 60 * 1000, resendAvailableAt: Date.now() + 60 * 1000 }));

function setup({
  submit = vi.fn().mockResolvedValue({ reference: 'CFL-2026-00001' }),
  store = memoryStore(),
  search = '',
  requestCode = freshCode(),
  checkCode = vi.fn().mockResolvedValue({ verified: true }),
  programmes,
} = {}) {
  loadPage('register.html');
  const controller = initRegistration({
    search,
    submit,
    store,
    now: () => NOW,
    requestCode,
    checkCode,
    programmes,
  });
  const form = document.querySelector('#registrationForm');
  return { controller, form, submit, store, requestCode, checkCode };
}

const activeStep = () => [...document.querySelectorAll('.step')].findIndex((s) => s.classList.contains('active')) + 1;
const clickNext = () => document.querySelector('.btn-next').click();
const submitForm = (form) => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

function completeAllSteps(form) {
  fill(form, step1); clickNext();
  fill(form, step2); clickNext();
  fill(form, step3); clickNext();
  fill(form, step4); clickNext();
  fill(form, step5); clickNext();
  fill(form, step6);
}

afterEach(() => { vi.useRealTimers(); });

describe('application form', () => {
  it('starts on step 1 with Back disabled and the date picker capped at today', () => {
    setup();
    expect(activeStep()).toBe(1);
    expect(document.querySelector('.btn-prev').disabled).toBe(true);
    expect(document.querySelector('#dateOfBirth').max).toBe('2026-10-06');
  });

  it('will not leave a step that has errors, and explains each problem next to its field', () => {
    setup();
    clickNext();
    expect(activeStep()).toBe(1);
    const error = document.querySelector('#firstName-error');
    expect(error.textContent).toMatch(/first name/i);
    expect(document.querySelector('#firstName').getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector('#firstName').getAttribute('aria-describedby')).toBe('firstName-error');
  });

  it('clears an error once the field is fixed', () => {
    const { form } = setup();
    clickNext();
    fill(form, step1);
    clickNext();
    expect(document.querySelector('#firstName-error')).toBeNull();
    expect(activeStep()).toBe(2);
  });

  it('walks through all steps and shows a readable review', () => {
    const { form, controller } = setup();
    completeAllSteps(form);
    fill(form, { consent: true });
    clickNext();
    expect(activeStep()).toBe(7);
    expect(controller.step).toBe(6);
    const review = document.querySelector('#reviewList').textContent;
    expect(review).toContain('Wanjiku');
    expect(review).toContain('Female');
    expect(review).toContain('Kenyan');
    expect(review).toContain('Parent');
    expect(review).toContain('National ID');
    expect(review).toContain('Ending 5678');
    expect(review).toContain('English Language (Intake)');
    const idLabel = [...document.querySelectorAll('#reviewList dt')].find((node) => node.textContent === 'Identification number');
    expect(idLabel.nextElementSibling.textContent).toBe('Ending 5678');
    expect(document.querySelector('.btn-submit').hidden).toBe(false);
    expect(document.querySelector('.btn-next').hidden).toBe(true);
  });

  it('requires a parent or legal guardian contact and consent for applicants under 18', () => {
    const { form } = setup();
    expect(document.getElementById('guardianConsentGroup').hidden).toBe(true);
    fill(form, step1);
    expect(document.getElementById('guardianConsentGroup').hidden).toBe(false);
    clickNext();
    fill(form, step2); clickNext();
    fill(form, step3); clickNext();
    fill(form, step4); clickNext();
    fill(form, { ...step5, contactRelationship: 'sibling', guardianConsent: false });
    clickNext();
    expect(activeStep()).toBe(5);
    const errors = [...document.querySelectorAll('.field-error')].map((node) => node.textContent);
    const invalidFields = [...form.querySelectorAll('[aria-invalid="true"]')].map((node) => node.id);
    expect(errors, JSON.stringify({ step: activeStep(), invalidFields, dob: form.querySelector('#dateOfBirth').value })).toEqual(expect.arrayContaining([
      expect.stringMatching(/parent or legal guardian/i), expect.stringMatching(/required/i),
    ]));
  });

  it('Back returns to the previous step', () => {
    const { form } = setup();
    fill(form, step1); clickNext();
    document.querySelector('.btn-prev').click();
    expect(activeStep()).toBe(1);
  });

  it('will not send without consent', async () => {
    const { form, submit } = setup();
    completeAllSteps(form);
    submitForm(form);
    await tick();
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('#consent-error')).not.toBeNull();
  });

  async function reachCodeStep(options = {}) {
    const ctx = setup(options);
    completeAllSteps(ctx.form);
    fill(ctx.form, { consent: true });
    submitForm(ctx.form);
    await vi.waitFor(() => expect(document.querySelector('#otpVerification').hidden).toBe(false));
    return ctx;
  }
  const enterCode = (code = '482731') => {
    document.querySelector('#otpCode').value = code;
    document.querySelector('#verifyOtpButton').click();
  };

  it('sends the application, shows the reference and discards the draft after the server confirms the code', async () => {
    const { submit, store, form } = await reachCodeStep({ search: '?programme=english-intake' });
    enterCode();
    await vi.waitFor(() => expect(document.querySelector('#confirmation').hidden).toBe(false));
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][0]).toMatchObject({
      firstName: 'Wanjiku', email: 'parent@example.com', programmeId: 'english-intake', guardianConsent: true, consent: true, website: '',
    });
    expect(document.querySelector('#referenceNumber').textContent).toBe('CFL-2026-00001');
    expect(form.hidden).toBe(true);
    expect(store.clear).toHaveBeenCalled();
  });

  it('asks the server for a code and does not submit until it is confirmed', async () => {
    const { form, requestCode, submit, checkCode } = await reachCodeStep();
    expect(requestCode).toHaveBeenCalledWith({ email: 'parent@example.com', name: 'Wanjiku Kamau' });
    expect(checkCode).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(form.hidden).toBe(true);
  });

  it('never keeps a verification code in the browser', async () => {
    await reachCodeStep();
    enterCode();
    await vi.waitFor(() => expect(document.querySelector('#confirmation').hidden).toBe(false));
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem('cfl_otp_session')).toBeNull();
  });

  it('checks the entered code with the server, for the address the code was sent to', async () => {
    const { checkCode, submit } = await reachCodeStep();
    enterCode('482731');
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(checkCode).toHaveBeenCalledWith({ email: 'parent@example.com', code: '482731' });
    expect(document.querySelector('#confirmation').hidden).toBe(false);
  });

  it('updates the resend countdown from the times the server returned', async () => {
    vi.useFakeTimers();
    await reachCodeStep({
      requestCode: vi.fn(async () => ({ expiresAt: Date.now() + 600000, resendAvailableAt: Date.now() + 30000 })),
    });
    expect(document.querySelector('#otpCountdown').textContent).toContain('30 seconds');
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('#otpCountdown').textContent).toContain('29 seconds');
  });

  it('shows an expired-code message and enables resend when the code has run out, without calling the server', async () => {
    const { checkCode } = await reachCodeStep({
      requestCode: vi.fn(async () => ({ expiresAt: Date.now() - 1000, resendAvailableAt: Date.now() + 60000 })),
    });
    enterCode();
    expect(checkCode).not.toHaveBeenCalled();
    expect(document.querySelector('#otpError').textContent).toContain('expired');
    expect(document.querySelector('#resendOtpButton').disabled).toBe(false);
  });

  it('shows a clear error when the server says the code is wrong, and does not submit', async () => {
    const { submit, checkCode } = await reachCodeStep({
      checkCode: vi.fn().mockRejectedValue(rejection('invalid', 'That verification code is incorrect.')),
    });
    enterCode('000000');
    await vi.waitFor(() => expect(document.querySelector('#otpError').textContent).toContain('incorrect'));
    expect(checkCode).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('#verifyOtpButton').disabled).toBe(false);
  });

  it.each(['expired', 'too-many-attempts'])('asks for a new code and enables resend when the server reports %s', async (reason) => {
    await reachCodeStep({ checkCode: vi.fn().mockRejectedValue(rejection(reason, 'x')) });
    enterCode();
    await vi.waitFor(() => expect(document.querySelector('#resendOtpButton').disabled).toBe(false));
    expect(document.querySelector('#otpError').textContent).toContain('new code');
  });

  it('does not let the applicant ask for another code before the cooldown ends', async () => {
    const { requestCode } = await reachCodeStep();
    document.querySelector('#resendOtpButton').click();
    await tick();
    expect(requestCode).toHaveBeenCalledOnce();
    expect(document.querySelector('#otpCountdown').textContent).toContain('60 seconds');
  });

  it('asks for a new code once the cooldown has ended', async () => {
    vi.useFakeTimers();
    const { requestCode } = await reachCodeStep();
    vi.advanceTimersByTime(61000);
    document.querySelector('#resendOtpButton').click();
    await vi.waitFor(() => expect(requestCode).toHaveBeenCalledTimes(2));
  });

  it('shows the server message when a new code is refused', async () => {
    vi.useFakeTimers();
    const requestCode = freshCode();
    await reachCodeStep({ requestCode });
    requestCode.mockRejectedValueOnce(Object.assign(new Error('Too many code requests. Please try again later.'), { details: { reason: 'rate-limited' } }));
    vi.advanceTimersByTime(61000);
    document.querySelector('#resendOtpButton').click();
    await vi.waitFor(() => expect(document.querySelector('#otpError').textContent).toContain('Too many code requests'));
  });

  it('returns to the right step and field when the server rejects a value after verification', async () => {
    const failure = Object.assign(new Error('Check the highlighted fields and try again.'), {
      fieldErrors: { email: 'That email address is not accepted.' },
    });
    const { form } = await reachCodeStep({ submit: vi.fn().mockRejectedValue(failure) });
    enterCode();
    await vi.waitFor(() => expect(document.querySelector('#formError').hidden).toBe(false));
    expect(form.hidden).toBe(false);
    expect(activeStep()).toBe(4);
    expect(document.querySelector('#email-error').textContent).toBe('That email address is not accepted.');
    expect(document.querySelector('#verifyOtpButton').disabled).toBe(false);
  });

  it('keeps the form and the draft when the network fails after verification', async () => {
    const { form, store } = await reachCodeStep({ submit: vi.fn().mockRejectedValue(new Error("We can't reach the server.")) });
    enterCode();
    await vi.waitFor(() => expect(document.querySelector('#formError').textContent).toMatch(/reach the server/));
    expect(form.hidden).toBe(false);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('does not ask for a second code when a failed send is retried for the same address', async () => {
    const submit = vi.fn().mockRejectedValueOnce(new Error("We can't reach the server.")).mockResolvedValue({ reference: 'CFL-2026-00002' });
    const { form, requestCode } = await reachCodeStep({ submit });
    enterCode();
    await vi.waitFor(() => expect(document.querySelector('#formError').textContent).toMatch(/reach the server/));
    submitForm(form);
    await vi.waitFor(() => expect(document.querySelector('#confirmation').hidden).toBe(false));
    expect(requestCode).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('falls back to a fresh code when the server no longer treats the address as verified', async () => {
    const stale = Object.assign(new Error('Please verify your email address before sending your application.'), {
      code: 'failed-precondition', details: { reason: 'email-not-verified' },
    });
    const submit = vi.fn().mockRejectedValueOnce(new Error("We can't reach the server.")).mockRejectedValueOnce(stale);
    const { form, requestCode } = await reachCodeStep({ submit });
    enterCode();
    await vi.waitFor(() => expect(document.querySelector('#formError').textContent).toMatch(/reach the server/));
    submitForm(form);
    await vi.waitFor(() => expect(requestCode).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(document.querySelector('#otpVerification').hidden).toBe(false));
  });

  it('shows the server message when the verification email cannot be sent', async () => {
    const { form, submit } = setup({
      requestCode: vi.fn().mockRejectedValue(new Error('We could not send the verification email. Please try again in a moment.')),
    });
    completeAllSteps(form);
    fill(form, { consent: true });
    submitForm(form);
    await vi.waitFor(() => expect(document.querySelector('#formError').textContent).toContain('could not send the verification email'));
    expect(submit).not.toHaveBeenCalled();
    expect(form.hidden).toBe(false);
  });

  it('restores a saved draft and tells the person', () => {
    const store = memoryStore({ data: { firstName: 'Wanjiku', gender: 'female', email: 'a@b.co' }, step: 1 });
    setup({ store });
    expect(document.querySelector('#firstName').value).toBe('Wanjiku');
    expect(document.querySelector('[name="gender"][value="female"]').checked).toBe(true);
    expect(activeStep()).toBe(2);
    expect(document.querySelector('#draftNotice').hidden).toBe(false);
  });

  it('migrates a legacy guardian and emergency draft into one contact person', () => {
    const store = memoryStore({
      data: { ...step1, guardianName: 'Grace Kamau', relationship: 'parent', guardianPhone: '0722000111', emergencyContact: 'Peter Kamau' },
      step: 2,
    });
    setup({ store });
    expect(activeStep()).toBe(5);
    expect(document.getElementById('contactName').value).toBe('Grace Kamau');
    expect(document.getElementById('contactRelationship').value).toBe('parent');
    expect(document.getElementById('contactPhone').value).toBe('0722000111');
  });

  it('preselects a requested programme from the active catalogue', () => {
    setup({ search: '?programme=summer-english', programmes: [{ id: 'summer-english', name: 'Summer English' }] });
    const programme = document.getElementById('programmeId');
    expect(programme.value).toBe('summer-english');
    expect(programme.selectedOptions[0].textContent).toBe('Summer English');
  });

  it('saves the requested programme but not consent or the honeypot', () => {
    vi.useFakeTimers();
    const { form, store } = setup();
    fill(form, { ...step1, programmeId: 'english-intake', consent: true, guardianConsent: true });
    vi.advanceTimersByTime(500);
    expect(store.save).toHaveBeenCalled();
    const [data, step] = store.save.mock.calls.at(-1);
    expect(data).toMatchObject({ firstName: 'Wanjiku' });
    expect(data).not.toHaveProperty('consent');
    expect(data).not.toHaveProperty('guardianConsent');
    expect(data).not.toHaveProperty('website');
    expect(data.programmeId).toBe('english-intake');
    expect(step).toBe(0);
  });

  it('ignores a malformed programme in the address', () => {
    setup({ search: '?programme=Bad%20Id' });
    expect(document.querySelector('[name="programmeId"]').value).toBe('');
  });
});
