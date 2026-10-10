// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipKey, clipsSupported, normalise, playClip, stopClips } from '@/ui/voice.js';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

class FakeAudio {
  static made = [];
  constructor(src) { this.src = src; this.playbackRate = 1; this.listeners = {}; FakeAudio.made.push(this); }
  canPlayType() { return 'maybe'; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  play() { this.played = true; return Promise.resolve(); }
  pause() { this.paused = true; }
}

afterEach(() => { stopClips(); FakeAudio.made = []; vi.unstubAllGlobals(); });

describe('clip keys', () => {
  it('match the keys scripts/build-voice.py writes (reference vectors from the Python implementation)', () => {
    expect(clipKey('Hello world')).toBe('594d29c7');
    expect(clipKey('neighbour')).toBe('5b2455e8');
    expect(clipKey('Good morning.')).toBe('575b1d3a');
    expect(clipKey('  I wake up   at \u2026 ')).toBe('5e328caa');
  });

  it('ignore extra whitespace', () => {
    expect(normalise('  a \n b  ')).toBe('a b');
    expect(clipKey('a   b')).toBe(clipKey('a b'));
  });
});

describe('rendered clip manifest', () => {
  const manifest = read('public/audio/voice/manifest.json');

  it('has a clip for every spoken line in the lessons (re-run npm run voice after editing lesson text)', () => {
    const spoken = [];
    for (const l of read('src/data/practice/listening.json').lessons) spoken.push(l.listening.text);
    for (const l of read('src/data/practice/vocabulary.json').lessons) for (const w of l.words) spoken.push(w.word, ...(w.example ? [w.example] : []));
    for (const l of read('src/data/practice/speaking.json').lessons) for (const p of l.prompts) spoken.push(p.text);
    expect(spoken.length).toBeGreaterThan(30);
    const missing = spoken.filter((text) => manifest.clips[clipKey(text)]?.text !== normalise(text));
    expect(missing).toEqual([]);
  });

  it('has every interface line, each pointing at a clip file that exists', () => {
    const lines = read('src/data/voice-lines.json');
    for (const [id, text] of Object.entries(lines)) {
      const clip = manifest.clips[manifest.lines[id]];
      expect(clip?.text, id).toBe(normalise(text));
      expect(() => readFileSync(resolve(root, 'public/audio/voice', clip.file)), id).not.toThrow();
    }
  });
});

describe('looking clips up', () => {
  const stubFetch = (data, ok = true) => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(data) })));

  it('finds a clip by its exact text and rejects a text that merely collides', async () => {
    vi.resetModules();
    const voice = await import('@/ui/voice.js');
    stubFetch({ lines: { 'home.welcome': 'k1' }, clips: { [voice.clipKey('Hello')]: { text: 'Hello', file: 'a.mp3' }, k1: { text: 'Welcome', file: 'b.mp3' } } });
    expect((await voice.findClip('Hello')).file).toBe('a.mp3');
    expect(await voice.findClip('Goodbye')).toBeNull();
    expect((await voice.findLine('home.welcome')).file).toBe('b.mp3');
    expect(await voice.findLine('nope')).toBeNull();
  });

  it('resolves to null instead of throwing when the manifest is missing', async () => {
    vi.resetModules();
    const voice = await import('@/ui/voice.js');
    stubFetch(null, false);
    expect(await voice.loadManifest()).toBeNull();
    expect(await voice.findClip('Hello')).toBeNull();
  });
});

describe('playback', () => {
  it('reports no clip support in an environment that cannot play MP3', () => {
    expect(clipsSupported()).toBe(false);
  });

  it('plays one clip at a time, at the requested rate, and reports the end', () => {
    vi.stubGlobal('Audio', FakeAudio);
    expect(clipsSupported()).toBe(true);
    const onend = vi.fn();
    playClip({ file: 'one.mp3' }, { rate: 0.8, onend });
    const [first] = FakeAudio.made.slice(-1);
    expect(first.src).toBe('/audio/voice/one.mp3');
    expect(first.playbackRate).toBe(0.8);
    expect(first.preservesPitch).toBe(true);
    playClip({ file: 'two.mp3' });
    expect(first.paused).toBe(true);
    first.listeners.ended();
    expect(onend).not.toHaveBeenCalled(); // superseded clips do not report
  });

  it('reports an error when the browser refuses to play', async () => {
    class Blocked extends FakeAudio { play() { return Promise.reject(new Error('NotAllowed')); } }
    vi.stubGlobal('Audio', Blocked);
    const onerror = vi.fn();
    playClip({ file: 'x.mp3' }, { onerror });
    await Promise.resolve(); await Promise.resolve();
    expect(onerror).toHaveBeenCalledOnce();
  });
});
