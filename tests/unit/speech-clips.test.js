// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
  static made = [];
  constructor(src) { this.src = src; this.playbackRate = 1; this.listeners = {}; FakeAudio.made.push(this); }
  canPlayType() { return 'maybe'; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  play() { return Promise.resolve(); }
  pause() {}
}
class FakeUtterance { constructor(text) { this.text = text; } }

const tick = () => new Promise((r) => setTimeout(r, 0));
let speech;
let key;

async function load(clips) {
  vi.resetModules();
  vi.stubGlobal('Audio', FakeAudio);
  const voice = await import('@/ui/voice.js');
  key = voice.clipKey;
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ clips: clips(voice.clipKey) }) })));
  speech = await import('@/ui/speech.js');
}

beforeEach(() => { FakeAudio.made = []; });
afterEach(() => { vi.unstubAllGlobals(); delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });

describe('audio player with rendered clips', () => {
  it('loads, plays the clip, supports slow speed, and finishes', async () => {
    await load((k) => ({ [k('Good morning.')]: { text: 'Good morning.', file: 'gm.mp3' } }));
    const { element, supported } = speech.createAudioPlayer('Good morning.');
    expect(supported).toBe(true);
    const [play, slow] = element.querySelectorAll('button');
    play.click();
    expect(element.dataset.state).toBe('loading');
    expect(play.textContent).toBe('Stop');
    await tick();
    expect(element.dataset.state).toBe('playing');
    const audio = FakeAudio.made.at(-1);
    expect(audio.src).toBe('/audio/voice/gm.mp3');
    slow.click();
    expect(audio.playbackRate).toBe(0.8);
    audio.listeners.ended();
    expect(element.dataset.state).toBe('finished');
    expect(play.textContent).toBe('Play again');
  });

  it('falls back to browser speech when the text has no clip', async () => {
    await load(() => ({}));
    const spoken = [];
    window.SpeechSynthesisUtterance = FakeUtterance;
    window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn((u) => spoken.push(u)), getVoices: () => [] };
    const { element } = speech.createAudioPlayer('Unrecorded text.');
    element.querySelector('button').click();
    await tick();
    expect(spoken[0].text).toBe('Unrecorded text.');
    expect(element.dataset.state).toBe('playing');
  });

  it('shows the error message when there is no clip and no browser speech', async () => {
    await load(() => ({}));
    const { element } = speech.createAudioPlayer('Unrecorded text.');
    element.querySelector('button').click();
    await tick();
    expect(element.dataset.state).toBe('error');
  });

  it('stop() during loading prevents the clip from starting', async () => {
    await load((k) => ({ [k('Hi')]: { text: 'Hi', file: 'hi.mp3' } }));
    const player = speech.createAudioPlayer('Hi');
    player.element.querySelector('button').click();
    player.stop();
    await tick();
    expect(FakeAudio.made.filter((a) => a.src)).toHaveLength(0);
    expect(player.element.dataset.state).toBe('idle');
  });

  it('speak() plays the clip for a word, and uses browser speech for one without a clip', async () => {
    await load((k) => ({ [k('mother')]: { text: 'mother', file: 'mother.mp3' } }));
    const spoken = [];
    window.SpeechSynthesisUtterance = FakeUtterance;
    window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn((u) => spoken.push(u)), getVoices: () => [] };
    speech.speak('mother');
    await tick();
    expect(FakeAudio.made.at(-1).src).toBe('/audio/voice/mother.mp3');
    expect(spoken).toHaveLength(0);
    speech.speak('xylophone');
    await tick();
    expect(spoken.at(-1).text).toBe('xylophone');
    expect(key('mother')).toHaveLength(8);
  });
});
