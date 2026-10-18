// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
  static made = [];
  constructor(src) { this.src = new URL(src, 'http://x').pathname; FakeAudio.made.push(this); this.listeners = {}; }
  canPlayType() { return 'maybe'; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  play() { return Promise.resolve(); }
  pause() {}
}
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('voice setting', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeAudio.made = [];
    window.localStorage.clear();
    document.body.innerHTML = '<select id="v"><option value="female"></option><option value="male"></option></select><button id="s"></button>';
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({
      lines: { 'home.welcome': 'k' }, clips: { k: { text: 'Welcome', file: 'w.mp3' } },
    }) })));
  });

  it('plays a sample in the selected voice without saving the choice', async () => {
    const { mountVoiceSetting } = await import('@/ui/voice-setting.js');
    const select = document.getElementById('v');
    mountVoiceSetting({ select, sample: document.getElementById('s'), saved: 'female' });
    select.value = 'male';
    document.getElementById('s').click();
    await flush();
    expect(FakeAudio.made.at(-1).src).toBe('/audio/voice/male/w.mp3');
    expect(window.localStorage.getItem('cfl.voice')).toBe('female');
  });

  it('applies the choice when asked, and shows the account voice over a stale browser one', async () => {
    window.localStorage.setItem('cfl.voice', 'male');
    const { mountVoiceSetting } = await import('@/ui/voice-setting.js');
    const select = document.getElementById('v');
    const setting = mountVoiceSetting({ select, sample: document.getElementById('s'), saved: 'female' });
    expect(select.value).toBe('female');
    select.value = 'male';
    setting.apply();
    expect(window.localStorage.getItem('cfl.voice')).toBe('male');
  });

  it('hides the sample button when the browser cannot play MP3', async () => {
    vi.stubGlobal('Audio', class { canPlayType() { return ''; } });
    const { mountVoiceSetting } = await import('@/ui/voice-setting.js');
    mountVoiceSetting({ select: document.getElementById('v'), sample: document.getElementById('s') });
    expect(document.getElementById('s').hidden).toBe(true);
  });
});
