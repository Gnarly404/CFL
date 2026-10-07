export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Builds DOM without innerHTML, so user-supplied text can never become markup. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Disables a submit button and shows progress text while work is in flight. */
export function setBusy(button, busy, busyLabel = 'Please wait…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    if (button.dataset.label) button.textContent = button.dataset.label;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

/** Shows or clears a message in a live region. kind: 'error' | 'success' | 'info' */
export function showMessage(node, text, kind = 'info') {
  if (!node) return;
  node.textContent = text ?? '';
  node.hidden = !text;
  node.dataset.kind = kind;
}

export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Wires every .password-toggle button to the input before it. */
export function wirePasswordToggles(root = document) {
  root.querySelectorAll('.password-toggle').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const input = button.closest('.password-wrapper')?.querySelector('input');
      if (!input) return;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(reveal));
      button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    });
  });
}

/** Sets an inline error under a field and marks it invalid for assistive technology. */
export function setFieldError(field, message) {
  const group = field.closest('.form-group') ?? field.parentElement;
  const id = `${field.id || field.name}-error`;
  let node = document.getElementById(id);
  if (!message) {
    node?.remove();
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    field.classList.remove('is-invalid');
    return;
  }
  if (!node) {
    node = el('p', { class: 'field-error', id, role: 'alert' });
    group.append(node);
  }
  node.textContent = message;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', id);
  field.classList.add('is-invalid');
}
