// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { initRegistration } from '@/registration/registration-controller.js';
import { initCopyReference, initStepper } from '@/registration/registration-ui.js';
import { fill, loadPage } from '../helpers.js';

const store = () => ({ save: vi.fn(), load: () => null, clear: vi.fn() });
const states = () => [...document.querySelectorAll('#applySteps li')].map((item) => item.dataset.state);

describe('application step list', () => {
  it('is driven by the form: the controller announces each step it shows', () => {
    loadPage('register.html');
    const controller = initRegistration({ store: store(), now: () => new Date('2026-10-06T12:00:00Z') });
    const form = document.querySelector('#registrationForm');
    const seen = [];
    form.addEventListener('cfl:step', (event) => seen.push(event.detail));
    initStepper({ goTo: (index) => controller.showStep(index), current: () => controller.step });
    expect(states()).toEqual(['current', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
    expect(document.querySelector('#stepLabel').textContent).toBe('Step 1 of 7 · Legal identity');

    fill(form, { firstName: 'Wanjiku', surname: 'Kamau', dateOfBirth: '2012-05-14' });
    document.querySelector('.btn-next').click();
    expect(seen.at(-1)).toMatchObject({ index: 1, previous: 0, total: 7 });
    expect(states()).toEqual(['done', 'current', 'todo', 'todo', 'todo', 'todo', 'todo']);
    expect(document.querySelector('#stepLabel').textContent).toBe('Step 2 of 7 · Personal details');
    expect(document.querySelector('#applySteps li[aria-current="step"] .apply-step-state').textContent).toBe('Current step');
  });

  it('lets a person go back to a finished step, but never ahead to one they have not completed', () => {
    loadPage('register.html');
    const goTo = vi.fn();
    const form = document.querySelector('#registrationForm');
    initStepper({ goTo, current: () => 0 });
    form.dispatchEvent(new CustomEvent('cfl:step', { detail: { index: 2, previous: 1, total: 7 } }));
    const buttons = [...document.querySelectorAll('#applySteps button')];
    expect(buttons.map((button) => button.disabled)).toEqual([false, false, true, true, true, true, true]);
    buttons[0].click();
    expect(goTo).toHaveBeenCalledWith(0);
    document.querySelector('#applySteps li:nth-child(5)').click();
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  it('marks every step done once the application has been sent', async () => {
    loadPage('register.html');
    initStepper({ current: () => 6 });
    document.querySelector('#confirmation').hidden = false;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(states()).toEqual(Array(7).fill('done'));
    expect(document.querySelector('#stepLabel').textContent).toBe('Application sent');
  });
});

describe('copy reference', () => {
  it('copies the reference and says so, or hides itself where copying is unavailable', async () => {
    loadPage('register.html');
    document.querySelector('#referenceNumber').textContent = 'CFL-2026-00042';
    const writeText = vi.fn().mockResolvedValue(undefined);
    initCopyReference({ clipboard: { writeText } });
    document.querySelector('#copyReference').click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(writeText).toHaveBeenCalledWith('CFL-2026-00042');
    expect(document.querySelector('#copyReference').textContent).toBe('Copied');
    expect(document.querySelector('#copyStatus').textContent).toMatch(/copied/i);

    loadPage('register.html');
    initCopyReference({ clipboard: undefined });
    expect(document.querySelector('#copyReference').hidden).toBe(true);
  });
});
