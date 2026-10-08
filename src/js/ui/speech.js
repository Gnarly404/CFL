import { h } from './h.js';

/** Browser text-to-speech. Used as a stand-in for recorded audio until real recordings exist. */
export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? null;
}

function utteranceFor(text, lang, rate) {
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  return utterance;
}

/** Say one word or short phrase once. Does nothing when speech is unavailable. */
export function speak(text, lang = 'en-GB') {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utteranceFor(text, lang, 1));
}

const MESSAGES = {
  idle: 'Ready to play.',
  playing: 'Playing…',
  finished: 'Finished. You can play it again.',
  error: 'Audio could not play. Try again, or read the transcript after the questions.',
};

/** Play and stop controls with a slow-speed option. Returns the element, whether audio works here, and stop(). */
export function createAudioPlayer(text, { lang = 'en-GB' } = {}) {
  const supported = speechSupported();
  const status = h('p', { class: 'muted', role: 'status' }, supported ? MESSAGES.idle : 'Audio is not available on this device or browser. Read the transcript instead.');
  const element = h('div', { class: 'player' });
  if (!supported) {
    element.append(status);
    return { element, supported, stop() {} };
  }

  let state = 'idle';
  let token = 0;
  let slow = false;
  const playBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Play audio');
  const slowBtn = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' }, 'Slow speed');

  function set(next) {
    state = next;
    playBtn.textContent = next === 'playing' ? 'Stop' : next === 'finished' ? 'Play again' : 'Play audio';
    status.textContent = MESSAGES[next];
  }
  function stop() {
    token += 1;
    window.speechSynthesis.cancel();
    if (state === 'playing') set('idle');
  }
  function play() {
    token += 1;
    const mine = token;
    window.speechSynthesis.cancel();
    const utterance = utteranceFor(text, lang, slow ? 0.75 : 1);
    utterance.onend = () => { if (mine === token) set('finished'); };
    utterance.onerror = (event) => { if (mine === token && !['canceled', 'interrupted'].includes(event.error)) set('error'); };
    set('playing');
    window.speechSynthesis.speak(utterance);
  }

  playBtn.addEventListener('click', () => (state === 'playing' ? stop() : play()));
  slowBtn.addEventListener('click', () => { slow = !slow; slowBtn.setAttribute('aria-pressed', String(slow)); });
  element.append(h('div', { class: 'actions' }, playBtn, slowBtn), status);
  return { element, supported, stop };
}
