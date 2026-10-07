// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initRegistration } from '@/registration/registration-controller.js';
import { fill, loadPage, tick } from '../helpers.js';

const NOW = new Date('2026-10-06T12:00:00Z');
const step1 = { firstName: 'Wanjiku', surname: 'Kamau', dateOfBirth: '2012-05-14' };
const step2 = { gender: 'female', email: 'parent@example.com', phoneNumber: '0712345678', nationality: 'kenyan' };
const step3 = { guardianName: 'Grace Kamau', relationship: 'parent', guardianPhone: '0722000111', emergencyContact: 'Peter Kamau' };

function memoryStore(initial = null) {
  let draft = initial;
  return {
    save: vi.fn((data, step) => { draft = { data, step }; }),
    load: () => draft,
    clear: vi.fn(() => { draft = null; }),
  };
}

function setup({ submit = vi.fn().mockResolvedValue({ reference: 'CFL-2026-00001' }), store = memoryStore(), search = '' } = {}) {
  loadPage('register.html');
  const controller = initRegistration({ search, submit, store, now: () => NOW });
  const form = document.querySelector('#registrationForm');
  return { controller, form, submit, store };
}

const activeStep = () => [...document.querySelectorAll('.step')].findIndex((s) => s.classList.contains('active')) + 1;
const clickNext = () => document.querySelector('.btn-next').click();
const submitForm = (form) => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

function completeAllSteps(form) {
  fill(form, step1); clickNext();
  fill(form, step2); clickNext();
  fill(form, step3); clickNext();
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
    expect(activeStep()).toBe(4);
    expect(controller.step).toBe(3);
    const review = document.querySelector('#reviewList').textContent;
    expect(review).toContain('Wanjiku');
    expect(review).toContain('Female');
    expect(review).toContain('Kenyan');
    expect(review).toContain('Parent');
    expect(document.querySelector('.btn-submit').hidden).toBe(false);
    expect(document.querySelector('.btn-next').hidden).toBe(true);
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

  it('sends the application, shows the reference and discards the draft', async () => {
    const { form, submit, store } = setup({ search: '?programme=general-english' });
    completeAllSteps(form);
    fill(form, { consent: true });
    submitForm(form);
    await vi.waitFor(() => expect(document.querySelector('#confirmation').hidden).toBe(false));
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][0]).toMatchObject({
      firstName: 'Wanjiku', email: 'parent@example.com', programmeId: 'general-english', consent: true, website: '',
    });
    expect(document.querySelector('#referenceNumber').textContent).toBe('CFL-2026-00001');
    expect(form.hidden).toBe(true);
    expect(store.clear).toHaveBeenCalled();
  });

  it('returns to the right step and field when the server rejects a value', async () => {
    const failure = Object.assign(new Error('Check the highlighted fields and try again.'), {
      fieldErrors: { email: 'That email address is not accepted.' },
    });
    const { form } = setup({ submit: vi.fn().mockRejectedValue(failure) });
    completeAllSteps(form);
    fill(form, { consent: true });
    submitForm(form);
    await vi.waitFor(() => expect(document.querySelector('#formError').hidden).toBe(false));
    expect(activeStep()).toBe(2);
    expect(document.querySelector('#email-error').textContent).toBe('That email address is not accepted.');
    expect(document.querySelector('.btn-submit').disabled).toBe(false);
  });

  it('keeps the form and the draft when the network fails', async () => {
    const { form, store } = setup({ submit: vi.fn().mockRejectedValue(new Error("We can't reach the server.")) });
    completeAllSteps(form);
    fill(form, { consent: true });
    submitForm(form);
    await vi.waitFor(() => expect(document.querySelector('#formError').textContent).toMatch(/reach the server/));
    expect(form.hidden).toBe(false);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('restores a saved draft and tells the person', () => {
    const store = memoryStore({ data: { firstName: 'Wanjiku', gender: 'female', email: 'a@b.co' }, step: 1 });
    setup({ store });
    expect(document.querySelector('#firstName').value).toBe('Wanjiku');
    expect(document.querySelector('[name="gender"][value="female"]').checked).toBe(true);
    expect(activeStep()).toBe(2);
    expect(document.querySelector('#draftNotice').hidden).toBe(false);
  });

  it('saves drafts without consent, the honeypot or the programme', () => {
    vi.useFakeTimers();
    const { form, store } = setup({ search: '?programme=general-english' });
    fill(form, { ...step1, consent: true });
    vi.advanceTimersByTime(500);
    expect(store.save).toHaveBeenCalled();
    const [data, step] = store.save.mock.calls.at(-1);
    expect(data).toMatchObject({ firstName: 'Wanjiku' });
    expect(data).not.toHaveProperty('consent');
    expect(data).not.toHaveProperty('website');
    expect(data).not.toHaveProperty('programmeId');
    expect(step).toBe(0);
  });

  it('ignores a malformed programme in the address', () => {
    setup({ search: '?programme=Bad%20Id' });
    expect(document.querySelector('[name="programmeId"]').value).toBe('');
  });
});
