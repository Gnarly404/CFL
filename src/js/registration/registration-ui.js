/**
 * The parts of the application page that sit around the form: the step list in the side panel and the
 * "copy reference" button. The form controller announces each step with a `cfl:step` event; nothing here
 * validates or stores anything.
 */
const STATE_TEXT = { done: 'Completed', current: 'Current step', todo: 'Not started' };

export function initStepper({ root = document, goTo, current = () => 0 } = {}) {
  const form = root.querySelector('#registrationForm');
  if (!form) return null;
  const list = root.querySelector('#applySteps');
  const label = root.querySelector('#stepLabel');
  const items = list ? [...list.querySelectorAll('li')] : [];
  const names = items.map((item) => item.querySelector('.apply-step-name')?.textContent.trim() ?? '');
  const total = form.querySelectorAll('.step').length;
  let shown = -1;

  function render(index) {
    shown = index;
    items.forEach((item, position) => {
      const state = position < index ? 'done' : position === index ? 'current' : 'todo';
      item.dataset.state = state;
      if (state === 'current') item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      const button = item.querySelector('button');
      if (button) button.disabled = position >= index; // only steps already completed can be revisited
      const note = item.querySelector('.apply-step-state');
      if (note) note.textContent = STATE_TEXT[state];
    });
    if (label) label.textContent = index >= total ? 'Application sent' : `Step ${index + 1} of ${total}${names[index] ? ` · ${names[index]}` : ''}`;
  }

  form.addEventListener('cfl:step', (event) => render(event.detail.index));
  // When the application has been sent, every step is complete.
  const confirmation = root.querySelector('#confirmation');
  if (confirmation) {
    new MutationObserver(() => { if (!confirmation.hidden) render(total); }).observe(confirmation, { attributes: true, attributeFilter: ['hidden'] });
  }
  list?.addEventListener('click', (event) => {
    const position = items.indexOf(event.target.closest?.('li'));
    if (position < 0 || position >= shown) return;
    goTo?.(position);
    const heading = form.querySelectorAll('.step')[position]?.querySelector('h2');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  });

  render(current());
  return { render };
}

export function initCopyReference({ root = document, clipboard = globalThis.navigator?.clipboard } = {}) {
  const button = root.querySelector('#copyReference');
  const reference = root.querySelector('#referenceNumber');
  const status = root.querySelector('#copyStatus');
  if (!button || !reference) return;
  if (!clipboard?.writeText) { button.hidden = true; return; }
  const idle = button.textContent;
  let timer = 0;
  button.addEventListener('click', async () => {
    let message = 'Copied';
    try { await clipboard.writeText(reference.textContent.trim()); } catch { message = 'Could not copy'; }
    button.textContent = message;
    if (status) status.textContent = message === 'Copied' ? 'Reference copied to the clipboard.' : 'The reference could not be copied. Select it and copy it by hand.';
    clearTimeout(timer);
    timer = setTimeout(() => { button.textContent = idle; }, 2200);
  });
}
