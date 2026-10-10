import { h } from './h.js';
import { clipsSupported, findClip, playClip, stopClips } from './voice.js';

/**
 * Speech for lessons. Piper-rendered clips (see voice.js) are used whenever one exists for the text;
 * browser text-to-speech remains the fallback for anything without a clip and for browsers that cannot play MP3.
 */
const browserSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
export const speechSupported = () => browserSpeech() || clipsSupported();

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
function browserSpeak(text, lang) {
  if (!browserSpeech()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utteranceFor(text, lang, 1));
}

export function speak(text, lang = 'en-GB') {
  if (!clipsSupported()) { browserSpeak(text, lang); return; }
  if (browserSpeech()) window.speechSynthesis.cancel();
  findClip(text).then((clip) => (clip ? playClip(clip) : browserSpeak(text, lang)));
}

const MESSAGES = {
  idle: 'Ready to play.',
  loading: 'Loading audio…',
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
  let control = null;
  const playBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Play audio');
  const slowBtn = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' }, 'Slow speed');
  const wave = h('span', { class: 'wave', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i'));

  function set(next) {
    state = next;
    element.dataset.state = next;
    playBtn.textContent = next === 'playing' || next === 'loading' ? 'Stop' : next === 'finished' ? 'Play again' : 'Play audio';
    status.textContent = MESSAGES[next];
  }
  function halt() {
    control = null;
    stopClips();
    if (browserSpeech()) window.speechSynthesis.cancel();
  }
  function stop() {
    token += 1;
    halt();
    if (state === 'playing' || state === 'loading') set('idle');
  }
  function playBrowser(mine) {
    const utterance = utteranceFor(text, lang, slow ? 0.75 : 1);
    utterance.onend = () => { if (mine === token) set('finished'); };
    utterance.onerror = (event) => { if (mine === token && !['canceled', 'interrupted'].includes(event.error)) set('error'); };
    set('playing');
    window.speechSynthesis.speak(utterance);
  }
  function play() {
    token += 1;
    const mine = token;
    halt();
    if (!clipsSupported()) { playBrowser(mine); return; }
    set('loading');
    findClip(text).then((clip) => {
      if (mine !== token) return;
      if (!clip) { if (browserSpeech()) playBrowser(mine); else set('error'); return; }
      set('playing');
      control = playClip(clip, {
        rate: slow ? 0.8 : 1,
        onend: () => { if (mine === token) set('finished'); },
        onerror: () => { if (mine === token) set('error'); },
      });
    });
  }

  playBtn.addEventListener('click', () => (state === 'playing' || state === 'loading' ? stop() : play()));
  slowBtn.addEventListener('click', () => {
    slow = !slow;
    slowBtn.setAttribute('aria-pressed', String(slow));
    control?.setRate(slow ? 0.8 : 1);
  });
  element.append(h('div', { class: 'actions' }, playBtn, slowBtn, wave), status);
  return { element, supported, stop };
}
