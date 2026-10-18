/**
 * Spoken audio rendered offline with Piper (scripts/build-voice.py) and served as small MP3 files.
 * Clips are looked up by a hash of the exact text, so lesson content and the interface's own lines
 * share one mechanism. When there is no clip for some text, callers fall back to browser speech.
 */
const ROOT = '/audio/voice/';

/** The two voices the app offers. Each has its own folder of clips and its own manifest. */
export const VOICES = Object.freeze(['female', 'male']);
export const VOICE_LABELS = Object.freeze({ female: 'Female voice', male: 'Male voice' });
export const DEFAULT_VOICE = 'female';
const KEY = 'cfl.voice';
const EVENT = 'cfl:voice';

/**
 * The listener's chosen voice. It is kept in this browser as well as on their account, so every page speaks in
 * it from the first sound, the same way the Reduce motion setting works.
 */
export function getVoicePreference() {
  try {
    const saved = window.localStorage.getItem(KEY);
    return VOICES.includes(saved) ? saved : DEFAULT_VOICE;
  } catch { return DEFAULT_VOICE; }
}

/** Saves the choice, stops anything playing in the old voice, and tells the page. Unknown values are ignored. */
export function setVoicePreference(voice) {
  if (!VOICES.includes(voice)) return getVoicePreference();
  const changed = voice !== getVoicePreference();
  try { window.localStorage.setItem(KEY, voice); } catch { /* private mode: the choice lasts for this page only */ }
  if (changed) {
    stopClips();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: voice }));
  }
  return voice;
}

/** Collapse whitespace. Must match normalise() in scripts/build-voice.py. */
export const normalise = (text) => String(text).split(/\s+/).filter(Boolean).join(' ');

/** FNV-1a 32-bit over UTF-8, as 8 hex digits. Must match clip_key() in scripts/build-voice.py. */
export function clipKey(text) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(normalise(text))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function clipsSupported() {
  if (typeof Audio !== 'function') return false;
  try { return Boolean(new Audio().canPlayType('audio/mpeg')); } catch { return false; }
}

const manifests = new Map();
const loading = new Map();

/** Fetches a voice's manifest once. Resolves to null (never rejects) when it is missing or unreadable. */
export function loadManifest(voice = getVoicePreference()) {
  if (manifests.has(voice)) return Promise.resolve(manifests.get(voice));
  if (!loading.has(voice)) {
    loading.set(voice, (typeof fetch === 'function' ? fetch(`${ROOT}${voice}/manifest.json`) : Promise.reject(new Error('no fetch')))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { const ok = data?.clips ? data : null; if (ok) manifests.set(voice, ok); return ok; })
      .catch(() => null)
      .finally(() => { loading.delete(voice); }));
  }
  return loading.get(voice);
}

const entryFor = (data, key, text, voice) => {
  const clip = data?.clips?.[key];
  // The stored text must match exactly: a hash collision or an edited lesson falls back to browser speech.
  // The clip remembers its voice, so it is fetched from the right folder even if the choice changes mid-way.
  return clip && (text === undefined || clip.text === normalise(text)) ? { ...clip, voice } : null;
};

/** The clip for some text, or null. */
export const findClip = (text, voice = getVoicePreference()) => {
  return loadManifest(voice).then((data) => entryFor(data, clipKey(text), text, voice));
};

/** The clip for a named interface line (see src/data/voice-lines.json), or null. */
export const findLine = (id, voice = getVoicePreference()) => {
  return loadManifest(voice).then((data) => entryFor(data, data?.lines?.[id], undefined, voice));
};

let current = null;

export function stopClips() {
  if (!current) return;
  const { audio } = current;
  current = null;
  audio.pause();
}

/** Plays a clip. `rate` slows playback without changing pitch. Only one clip plays at a time. */
export function playClip(clip, { rate = 1, onend, onerror } = {}) {
  stopClips();
  const audio = new Audio(`${ROOT}${clip.voice ?? getVoicePreference()}/${clip.file}`);
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
  audio.playbackRate = rate;
  const control = { audio, setRate(next) { audio.playbackRate = next; } };
  const end = (callback) => () => { if (current === control) { current = null; callback?.(); } };
  audio.addEventListener('ended', end(onend));
  audio.addEventListener('error', end(onerror));
  current = control;
  try {
    const started = audio.play();
    started?.catch?.(end(onerror));
  } catch {
    end(onerror)();
  }
  return control;
}
