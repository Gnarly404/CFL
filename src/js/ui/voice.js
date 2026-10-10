/**
 * Spoken audio rendered offline with Piper (scripts/build-voice.py) and served as small MP3 files.
 * Clips are looked up by a hash of the exact text, so lesson content and the interface's own lines
 * share one mechanism. When there is no clip for some text, callers fall back to browser speech.
 */
const BASE = '/audio/voice/';
const MANIFEST_URL = `${BASE}manifest.json`;

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

let manifest = null;
let loading = null;

/** Fetches the manifest once. Resolves to null (never rejects) when it is missing or unreadable. */
export function loadManifest() {
  if (manifest) return Promise.resolve(manifest);
  if (!loading) {
    loading = (typeof fetch === 'function' ? fetch(MANIFEST_URL) : Promise.reject(new Error('no fetch')))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { manifest = data?.clips ? data : null; return manifest; })
      .catch(() => null)
      .finally(() => { loading = null; });
  }
  return loading;
}

const entryFor = (data, key, text) => {
  const clip = data?.clips?.[key];
  // The stored text must match exactly: a hash collision or an edited lesson falls back to browser speech.
  return clip && (text === undefined || clip.text === normalise(text)) ? clip : null;
};

/** The clip for some text, or null. */
export const findClip = (text) => loadManifest().then((data) => entryFor(data, clipKey(text), text));

/** The clip for a named interface line (see src/data/voice-lines.json), or null. */
export const findLine = (id) => loadManifest().then((data) => entryFor(data, data?.lines?.[id]));

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
  const audio = new Audio(`${BASE}${clip.file}`);
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
