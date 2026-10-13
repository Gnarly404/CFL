import { animate, stagger } from 'motion';
import { DUR, EASE } from './tokens.js';
import { pick, play, settle } from './dom.js';

/**
 * Feedback for forms. Markup: <form data-motion-form>.
 *   - a new .field-error eases in, and the invalid field gives a short shake
 *   - pressing Next or Send with problems shakes every invalid field again, so the answer is never silent
 *   - multi-step forms announce each step with a `cfl:step` event ({ index, previous }); the new step slides in
 *     from the side you are travelling towards and its fields rise in turn
 */
const seen = new WeakSet();
const REST = 'translate3d(0, 0, 0)';

function shake(field) {
  const target = field?.type === 'radio' ? field.closest('fieldset') ?? field : field;
  if (!target) return;
  play(() => animate(target, { transform: ['translateX(0)', 'translateX(-6px)', 'translateX(6px)', 'translateX(-4px)', 'translateX(4px)', 'translateX(0)'] }, { duration: 0.36, ease: 'easeInOut' }))
    .then(() => settle(target));
}

function bind(form) {
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || !node.matches?.('.field-error')) continue;
        play(() => animate(node, { opacity: [0, 1], transform: ['translate3d(0, -4px, 0)', REST] }, { duration: DUR.micro, ease: EASE.out })).then(() => settle(node));
        shake(node.closest('.form-group')?.querySelector('[aria-invalid="true"]'));
      }
    }
  }).observe(form, { childList: true, subtree: true });

  // Runs after the form's own handlers (a timeout is the simplest way to land behind them).
  const shakeInvalid = () => setTimeout(() => form.querySelectorAll('.step.active [aria-invalid="true"], :scope > [aria-invalid="true"]').forEach(shake), 0);
  form.addEventListener('click', (event) => { if (event.target.closest?.('.btn-next')) shakeInvalid(); });
  form.addEventListener('submit', shakeInvalid);

  form.addEventListener('cfl:step', (event) => {
    const { index, previous } = event.detail ?? {};
    if (previous == null || previous === index) return;
    const step = form.querySelectorAll('.step')[index];
    if (!step) return;
    const direction = index > previous ? 1 : -1;
    play(() => animate(step, { transform: [`translate3d(${direction * 18}px, 0, 0)`, REST] }, { duration: DUR.swap, ease: EASE.out })).then(() => settle(step));
    const fields = [...step.children];
    play(() => animate(fields, { opacity: [0, 1], transform: ['translate3d(0, 12px, 0)', REST] }, { duration: DUR.swap, ease: EASE.out, delay: stagger(0.045, { startDelay: 0.04 }) })).then(() => settle(fields));
  });
}

export function scanForms(root) {
  pick(root, '[data-motion-form]').forEach((form) => {
    if (seen.has(form)) return;
    seen.add(form);
    bind(form);
  });
}
