import { h } from './h.js';

/** Microphone recorder with playback. Recordings stay in memory on this device and are never uploaded. */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const BLOCKED = 'Microphone access was blocked. Allow the microphone in your browser settings, then try again.';
const ERRORS = {
  NotAllowedError: BLOCKED,
  SecurityError: BLOCKED,
  NotFoundError: 'No microphone was found on this device.',
  NotReadableError: 'The microphone is being used by another app. Close it and try again.',
};
const READY = 'Press Start recording when you are ready.';

export const recordingSupported = () => typeof window !== 'undefined'
  && typeof window.MediaRecorder === 'function'
  && Boolean(window.navigator?.mediaDevices?.getUserMedia);

const pickMime = () => MIME_TYPES.find((type) => window.MediaRecorder.isTypeSupported?.(type)) ?? '';
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function createRecorder({ maxSeconds = 60, onChange = () => {} } = {}) {
  const supported = recordingSupported();
  const status = h('p', { class: 'muted', role: 'status' }, supported
    ? READY
    : 'Recording is not available in this browser. Try a current version of Chrome, Edge, Firefox or Safari, on a secure (https) page.');
  const element = h('div', { class: 'player' });
  if (!supported) {
    element.append(status);
    return { element, supported, hasRecording: () => false, reset() {}, destroy() {} };
  }

  const timer = h('p', { class: 'timer', 'aria-hidden': 'true' }, clock(0));
  const recordBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Start recording');
  const againBtn = h('button', { class: 'btn', type: 'button' }, 'Record again');
  const audio = h('audio', { controls: true, 'aria-label': 'Playback of your recording' });
  againBtn.hidden = true;
  audio.hidden = true;
  element.append(h('div', { class: 'actions' }, recordBtn, againBtn), timer, status, audio);

  let state = 'idle';
  let stream = null;
  let recorder = null;
  let chunks = [];
  let ticker = null;
  let seconds = 0;
  let url = null;
  let destroyed = false;

  function setState(next, message) {
    state = next;
    status.textContent = message;
    recordBtn.hidden = next === 'recorded';
    recordBtn.disabled = next === 'requesting';
    recordBtn.textContent = next === 'recording' ? 'Stop recording' : 'Start recording';
    againBtn.hidden = next !== 'recorded';
    audio.hidden = next !== 'recorded';
  }
  const stopTicker = () => { clearInterval(ticker); ticker = null; };
  const releaseMic = () => { stream?.getTracks().forEach((track) => track.stop()); stream = null; };
  const dropAudio = () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
    audio.removeAttribute('src');
  };

  function stop() {
    if (state === 'recording') recorder.stop();
  }

  function finish() {
    stopTicker();
    releaseMic();
    if (!chunks.length) { setState('idle', 'Nothing was recorded. Please try again.'); return; }
    dropAudio();
    url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    audio.src = url;
    setState('recorded', 'Recorded on this device. Play it back below.');
    onChange(true);
  }

  async function start() {
    if (state === 'requesting' || state === 'recording') return;
    setState('requesting', 'Waiting for microphone permission…');
    try {
      stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setState('idle', ERRORS[error?.name] ?? 'The microphone could not start. Please try again.');
      return;
    }
    if (destroyed) { releaseMic(); return; }
    chunks = [];
    const mimeType = pickMime();
    try {
      recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      releaseMic();
      setState('idle', 'Recording could not start in this browser.');
      return;
    }
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onerror = () => { stopTicker(); releaseMic(); setState('idle', 'Recording stopped because of an error. Please try again.'); };
    recorder.onstop = finish;
    recorder.start();
    seconds = 0;
    timer.textContent = clock(0);
    ticker = setInterval(() => {
      seconds += 1;
      timer.textContent = clock(seconds);
      if (seconds >= maxSeconds) stop();
    }, 1000);
    setState('recording', `Recording… up to ${maxSeconds} seconds.`);
  }

  function reset() {
    dropAudio();
    timer.textContent = clock(0);
    setState('idle', READY);
    onChange(false);
  }

  function destroy() {
    destroyed = true;
    stopTicker();
    if (state === 'recording') { recorder.onstop = null; recorder.stop(); }
    releaseMic();
    dropAudio();
  }

  recordBtn.addEventListener('click', () => (state === 'recording' ? stop() : start()));
  againBtn.addEventListener('click', reset);
  return { element, supported, hasRecording: () => state === 'recorded', reset, destroy };
}
