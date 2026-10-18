/**
 * Short interface sounds for success and error, synthesised with the Web Audio API: nothing to download,
 * nothing for the content-security policy to allow. They are quiet, brief, and off when the person turns
 * "Interface sounds" off (kept in this browser as `cfl.sounds`, and on their account where they have one).
 */
const KEY = 'cfl.sounds';
const EVENT = 'cfl:sounds';

/** Notes are [frequency Hz, start s, length s]. Success rises and is bright; error falls and is low and blunt. */
export const CUES = Object.freeze({
  success: { wave: 'sine', gain: 0.07, notes: [[659.25, 0, 0.11], [880, 0.1, 0.2]], vibrate: [18] },
  error: { wave: 'triangle', gain: 0.09, notes: [[220, 0, 0.13], [164.81, 0.15, 0.22]], vibrate: [40, 50, 40] },
});

export function soundsEnabled() {
  try { return window.localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

/** Saves the choice for this browser and tells the page. */
export function setSoundsEnabled(on) {
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, 'off');
  } catch { /* private mode: the choice lasts for this page only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: Boolean(on) }));
  return Boolean(on);
}

let context = null;
const contextClass = () => (typeof window !== 'undefined' ? window.AudioContext ?? window.webkitAudioContext : undefined);

/** Creates and resumes the audio context. Call from a user gesture: browsers keep audio locked until then. */
export function unlockAudio() {
  const Ctx = contextClass();
  if (!Ctx) return null;
  try {
    context ??= new Ctx();
    if (context.state === 'suspended') context.resume?.().catch?.(() => {});
  } catch { context = null; }
  return context;
}

/**
 * Plays one cue. Does nothing when sounds are off, the tab is hidden, or audio is unavailable or still locked.
 * @returns {boolean} whether a sound was started
 */
export function playCue(kind) {
  const cue = CUES[kind];
  if (!cue || !soundsEnabled() || document.hidden) return false;
  const ctx = context ?? unlockAudio();
  if (!ctx || ctx.state === 'suspended') return false;
  try {
    const start = ctx.currentTime + 0.01;
    for (const [frequency, at, length] of cue.notes) {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      oscillator.type = cue.wave;
      oscillator.frequency.value = frequency;
      // A fast attack and a smooth fade: no click at the start, no abrupt cut at the end.
      envelope.gain.setValueAtTime(0.0001, start + at);
      envelope.gain.exponentialRampToValueAtTime(cue.gain, start + at + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
      oscillator.connect(envelope);
      envelope.connect(ctx.destination);
      oscillator.start(start + at);
      oscillator.stop(start + at + length + 0.02);
    }
    return true;
  } catch { return false; }
}

/** A short vibration on phones that support it, with the same on/off choice as the sounds. */
export function vibrateCue(kind) {
  const pattern = CUES[kind]?.vibrate;
  if (!pattern || !soundsEnabled() || document.hidden) return false;
  try { return Boolean(navigator.vibrate?.(pattern)); } catch { return false; }
}

/**
 * The "Interface sounds" checkbox in a settings form. `saved` is the value stored on the account (undefined
 * means never chosen, so the browser's own choice stands). Turning it on plays a sample so it can be heard.
 */
export function mountSoundSetting({ input, saved } = {}) {
  if (!input) return { value: () => soundsEnabled(), apply() {} };
  if (typeof saved === 'boolean') setSoundsEnabled(saved);
  input.checked = soundsEnabled();
  input.addEventListener('change', () => {
    unlockAudio();
    if (input.checked) {
      // Preview with the setting applied for a moment, without saving anything yet.
      try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
      playCue('success');
    }
  });
  return {
    value: () => input.checked,
    apply: () => setSoundsEnabled(input.checked),
  };
}
