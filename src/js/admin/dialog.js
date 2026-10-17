import { el } from '@/utils/dom.js';

/**
 * A modal dialog for the console, built on the native <dialog> element (which traps focus, closes on Escape
 * and hands focus back to whatever opened it). `confirmClose` runs before it closes, so a dialog with unsaved
 * edits can ask first.
 */
export function createDialog({
  id, title, eyebrow = '', wide = false, confirmClose = () => true,
}) {
  const titleId = `${id}Title`;
  const heading = el('h2', { id: titleId }, title);
  const eyebrowNode = el('p', { class: 'eyebrow' }, eyebrow);
  const close = el('button', { type: 'button', class: 'dialog-close', 'aria-label': 'Close' }, '×');
  const body = el('div', { class: 'dialog-body' });
  const footer = el('footer', { class: 'dialog-foot' });
  const dialog = el('dialog', { id, class: `console-dialog${wide ? ' console-dialog--wide' : ''}`, 'aria-labelledby': titleId },
    el('header', { class: 'dialog-head' }, el('div', {}, eyebrowNode, heading), close), body, footer);

  const api = {
    dialog,
    body,
    footer,
    setTitle(text, small = '') {
      heading.textContent = text;
      eyebrowNode.textContent = small;
      eyebrowNode.hidden = !small;
    },
    open() { if (!dialog.open) dialog.showModal(); },
    close() { if (dialog.open) dialog.close(); },
  };
  const tryClose = () => { if (confirmClose()) api.close(); };
  close.addEventListener('click', tryClose);
  // Escape asks first when there is something to lose: cancelling the event keeps the dialog open.
  dialog.addEventListener('cancel', (event) => { if (!confirmClose()) event.preventDefault(); });
  dialog.addEventListener('mousedown', (event) => { if (event.target === dialog) tryClose(); });
  eyebrowNode.hidden = !eyebrow;
  document.body.append(dialog);
  return api;
}
