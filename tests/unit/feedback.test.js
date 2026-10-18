// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeParam { setValueAtTime() {} exponentialRampToValueAtTime() {} }
class FakeContext {
  static made = [];
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.oscillators = []; FakeContext.made.push(this); }
  resume() { return Promise.resolve(); }
  createGain() { return { gain: new FakeParam(), connect() {} }; }
  createOscillator() { const o = { frequency: {}, connect() {}, start() {}, stop() {} }; this.oscillators.push(o); return o; }
}
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('interface sounds', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeContext.made = [];
    window.localStorage.clear();
    vi.stubGlobal('AudioContext', FakeContext);
    window.AudioContext = FakeContext;
  });
  afterEach(() => { vi.unstubAllGlobals(); delete window.AudioContext; });

  it('plays two-note cues, and none when switched off', async () => {
    const sound = await import('@/ui/feedback-sound.js');
    sound.unlockAudio();
    expect(sound.playCue('success')).toBe(true);
    expect(sound.playCue('error')).toBe(true);
    expect(FakeContext.made[0].oscillators).toHaveLength(4);
    expect(sound.playCue('nonsense')).toBe(false);
    sound.setSoundsEnabled(false);
    expect(sound.soundsEnabled()).toBe(false);
    expect(sound.playCue('success')).toBe(false);
    expect(sound.vibrateCue('error')).toBe(false);
  });

  it('stays silent while the audio context is still locked, and without audio support', async () => {
    const sound = await import('@/ui/feedback-sound.js');
    const ctx = sound.unlockAudio();
    ctx.state = 'suspended';
    expect(sound.playCue('success')).toBe(false);
    delete window.AudioContext;
    vi.resetModules();
    const bare = await import('@/ui/feedback-sound.js');
    expect(bare.playCue('success')).toBe(false);
  });

  it('the settings checkbox follows the saved value and saves only when applied', async () => {
    const sound = await import('@/ui/feedback-sound.js');
    document.body.innerHTML = '<input id="s" type="checkbox">';
    const input = document.getElementById('s');
    const setting = sound.mountSoundSetting({ input, saved: false });
    expect(input.checked).toBe(false);
    input.checked = true;
    expect(window.localStorage.getItem('cfl.sounds')).toBe('off');
    setting.apply();
    expect(window.localStorage.getItem('cfl.sounds')).toBeNull();
  });
});

describe('result feedback', () => {
  let stop;
  let cue;
  beforeEach(async () => {
    vi.resetModules();
    window.localStorage.clear();
    document.body.innerHTML = '<div class="form-group"><input id="email"></div><p id="note" class="form-alert" hidden></p>';
    cue = await import('@/ui/feedback-sound.js');
    vi.spyOn(cue, 'playCue').mockReturnValue(true);
    vi.spyOn(cue, 'vibrateCue').mockReturnValue(true);
    vi.spyOn(cue, 'unlockAudio').mockReturnValue(null);
  });
  afterEach(() => { stop?.(); vi.restoreAllMocks(); });

  const start = async (now) => { const { initFeedback } = await import('@/ui/feedback.js'); stop = initFeedback({ now }); };
  const show = (text, kind) => { const n = document.getElementById('note'); n.textContent = text; n.dataset.kind = kind; n.hidden = false; return n; };

  it('plays the success cue and pulses a message shown after a click', async () => {
    await start(() => 1000);
    document.dispatchEvent(new Event('pointerdown'));
    const note = show('Saved.', 'success');
    await tick();
    expect(cue.playCue).toHaveBeenCalledWith('success');
    expect(cue.vibrateCue).toHaveBeenCalledWith('success');
    expect(note.classList.contains('fb-pop')).toBe(true);
  });

  it('plays the error cue once for several bad fields and shakes each field', async () => {
    await start(() => 1000);
    document.dispatchEvent(new Event('submit'));
    const group = document.querySelector('.form-group');
    const input = document.getElementById('email');
    input.setAttribute('aria-describedby', 'email-error');
    const message = Object.assign(document.createElement('p'), { id: 'email-error', className: 'field-error', textContent: 'Enter an email.' });
    const second = Object.assign(document.createElement('p'), { className: 'field-error', textContent: 'Another.' });
    group.append(message, second);
    await tick();
    expect(cue.playCue).toHaveBeenCalledTimes(1);
    expect(cue.playCue).toHaveBeenCalledWith('error');
    expect(input.classList.contains('fb-shake')).toBe(true);
  });

  it('error outranks success in the same moment', async () => {
    await start(() => 1000);
    document.dispatchEvent(new Event('pointerdown'));
    show('Saved.', 'success');
    const n = Object.assign(document.createElement('p'), { className: 'field-error', textContent: 'Bad.' });
    document.querySelector('.form-group').append(n);
    await tick();
    expect(cue.playCue).toHaveBeenCalledTimes(1);
    expect(cue.playCue).toHaveBeenCalledWith('error');
  });

  it('stays silent for messages nobody asked for, hidden or empty ones, and info messages', async () => {
    let t = 1000;
    await start(() => t);
    show('Loaded your profile.', 'success'); // no interaction yet: a page-load message
    await tick();
    document.dispatchEvent(new Event('pointerdown'));
    t = 1000 + 20000; // the click is now too old to be this message's cause
    show('Late.', 'error');
    await tick();
    t = 1000 + 20100;
    document.dispatchEvent(new Event('pointerdown'));
    show('FYI', 'info');
    const note = document.getElementById('note');
    note.hidden = true;
    note.dataset.kind = 'error';
    await tick();
    expect(cue.playCue).not.toHaveBeenCalled();
  });
});
