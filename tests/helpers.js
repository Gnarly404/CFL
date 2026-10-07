import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/** Puts the <body> of a built page into the current jsdom document. */
export function loadPage(relativePath) {
  const html = readFileSync(resolve(root, 'src', relativePath), 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

/** Sets form values the way a person would, firing input events. */
export function fill(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const fields = [...form.querySelectorAll(`[name="${name}"]`)];
    const [first] = fields;
    if (first.type === 'radio') fields.forEach((field) => { field.checked = field.value === value; });
    else if (first.type === 'checkbox') first.checked = Boolean(value);
    else first.value = value;
    first.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export const tick = () => new Promise((resolveTick) => { setTimeout(resolveTick, 0); });
