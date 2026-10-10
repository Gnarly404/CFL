// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
  static made = [];
  constructor(src) { this.src = src; this.listeners = {}; FakeAudio.made.push(this); }
  canPlayType() { return 'maybe'; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function start(html) {
  vi.resetModules();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({
    lines: { 'results.good': 'k1', 'dash.morning': 'k2', 'dash.evening': 'k3' },
    clips: { k1: { text: 'Good work.', file: 'good.mp3' }, k2: { text: 'Morning.', file: 'am.mp3' }, k3: { text: 'Evening.', file: 'pm.mp3' } },
  }) })));
  document.body.innerHTML = html;
  const { initVoiceButtons } = await import('@/ui/voice-buttons.js');
  initVoiceButtons();
}
afterEach(() => { FakeAudio.made = []; vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = ''; });

const button = (line) => `<button type="button" data-voice-line="${line}" aria-pressed="false">Hear</button>`;

describe('voice buttons', () => {
  it('plays the named line, shows playing state, and clears it when the clip ends', async () => {
    await start(button('results.good'));
    const b = document.querySelector('button');
    b.click();
    expect(b.hasAttribute('data-loading')).toBe(true);
    await tick();
    expect(b.hasAttribute('data-playing')).toBe(true);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(FakeAudio.made.at(-1).src).toBe('/audio/voice/good.mp3');
    FakeAudio.made.at(-1).listeners.ended();
    expect(b.hasAttribute('data-playing')).toBe(false);
    expect(b.getAttribute('aria-pressed')).toBe('false');
  });

  it('works for buttons a page adds after start-up, and a second press stops the clip', async () => {
    await start('');
    document.body.insertAdjacentHTML('beforeend', button('results.good'));
    const b = document.querySelector('button');
    b.click(); await tick();
    expect(b.hasAttribute('data-playing')).toBe(true);
    b.click();
    expect(FakeAudio.made.at(-1).paused).toBe(true);
    expect(b.hasAttribute('data-playing')).toBe(false);
  });

  it('picks the greeting for the time of day with dash.auto', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 10, 20, 0, 0));
    await start(button('dash.auto'));
    document.querySelector('button').click();
    vi.useRealTimers();
    await tick();
    expect(FakeAudio.made.at(-1).src).toBe('/audio/voice/pm.mp3');
  });

  it('does nothing visible when a line has no clip', async () => {
    await start(button('no.such.line'));
    const b = document.querySelector('button');
    b.click(); await tick();
    expect(b.hasAttribute('data-playing')).toBe(false);
    expect(b.hasAttribute('data-loading')).toBe(false);
  });

  it('hides buttons in browsers that cannot play MP3', async () => {
    vi.resetModules();
    document.body.innerHTML = button('results.good');
    const { initVoiceButtons } = await import('@/ui/voice-buttons.js');
    initVoiceButtons();
    expect(document.querySelector('button').hidden).toBe(true);
  });
});
