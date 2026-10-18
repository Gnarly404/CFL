import {
  playCue, unlockAudio, vibrateCue,
} from './feedback-sound.js';

/**
 * Sound, a small pulse or shake, and (on phones) a short vibration whenever the page reports a result.
 * It listens for the places the app already uses for results instead of being called from each one:
 *   - a status message (toast, form alert, note) that becomes visible with data-kind "success" or "error";
 *   - an inline field error (.field-error) being added.
 * Only results that follow something the person just did are announced, so a message painted while a page
 * loads stays silent. All of it can be switched off with the "Interface sounds" setting.
 */
const RECENT_MS = 15000; // how long after a click, key press or submit a result still counts as its answer
const GAP_MS = 500; // the same kind of cue is not repeated inside this window
const KINDS = new Set(['success', 'error']);

export function initFeedback({ root = document, now = () => Date.now() } = {}) {
  const doc = root.ownerDocument ?? root;
  if (!doc.documentElement) return () => {};
  let lastInput = -Infinity;
  const lastCue = { success: -Infinity, error: -Infinity };
  const pending = new Set();
  let scheduled = false;

  const touch = () => { lastInput = now(); unlockAudio(); };
  const gestures = ['pointerdown', 'keydown', 'submit', 'change'];
  gestures.forEach((name) => doc.addEventListener(name, touch, true));

  const kindOf = (node) => {
    if (!(node instanceof Element) || node.hidden || node.closest('[hidden]')) return null;
    if (!node.textContent.trim()) return null;
    if (node.classList.contains('field-error')) return 'error';
    const kind = node.dataset.kind;
    return KINDS.has(kind) ? kind : null;
  };

  const retrigger = (node, name) => {
    node.classList.remove(name);
    // Reading offsetWidth restarts the CSS animation when the same message fires twice in a row.
    void node.offsetWidth;
    node.classList.add(name);
    node.addEventListener('animationend', () => node.classList.remove(name), { once: true });
  };

  const escape = (text) => (globalThis.CSS?.escape ? globalThis.CSS.escape(text) : text.replace(/[^\w-]/g, '\\$&'));
  const fieldFor = (message) => (message.id ? doc.querySelector(`[aria-describedby~="${escape(message.id)}"]`) : null);

  function flush() {
    scheduled = false;
    const nodes = [...pending];
    pending.clear();
    if (now() - lastInput > RECENT_MS) return;
    const found = new Map();
    for (const node of nodes) {
      const kind = kindOf(node);
      if (kind) found.set(node, kind);
    }
    if (!found.size) return;
    for (const [node, kind] of found) {
      if (kind === 'error') retrigger(node.classList.contains('field-error') ? (fieldFor(node) ?? node) : node, 'fb-shake');
      else retrigger(node, 'fb-pop');
    }
    // One cue per batch: a form with three bad fields makes one error sound, and an error outranks a success.
    const kind = [...found.values()].includes('error') ? 'error' : 'success';
    if (now() - lastCue[kind] < GAP_MS) return;
    lastCue[kind] = now();
    playCue(kind);
    vibrateCue(kind);
  }

  const queue = (node) => {
    if (!(node instanceof Element)) return;
    pending.add(node);
    if (!scheduled) { scheduled = true; queueMicrotask(flush); }
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') { queue(record.target); continue; }
      record.addedNodes.forEach((added) => {
        if (!(added instanceof Element)) return;
        queue(added);
        added.querySelectorAll?.('.field-error, [data-kind]').forEach(queue);
      });
      // Text changing inside a status message that is already on the page.
      const owner = record.target instanceof Element ? record.target : record.target.parentElement;
      const message = owner?.closest?.('[data-kind], .field-error');
      if (message) queue(message);
    }
  });
  observer.observe(doc.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'data-kind'],
  });

  return () => {
    observer.disconnect();
    gestures.forEach((name) => doc.removeEventListener(name, touch, true));
  };
}
