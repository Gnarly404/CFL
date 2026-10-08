// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioPlayer, speak, speechSupported } from '@/ui/speech.js';

class FakeUtterance {
  constructor(text) { this.text = text; }
}

function installSpeech() {
  const spoken = [];
  window.SpeechSynthesisUtterance = FakeUtterance;
  window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn((u) => spoken.push(u)), getVoices: () => [{ lang: 'en-US', name: 'v' }] };
  return spoken;
}

afterEach(() => {
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
});

describe('speech without browser support', () => {
  it('reports unsupported and shows a message with no controls', () => {
    expect(speechSupported()).toBe(false);
    const player = createAudioPlayer('Hello');
    expect(player.supported).toBe(false);
    expect(player.element.textContent).toContain('Audio is not available');
    expect(player.element.querySelector('button')).toBeNull();
    expect(() => speak('hi')).not.toThrow();
  });
});

describe('speech with browser support', () => {
  let spoken;
  beforeEach(() => { spoken = installSpeech(); });

  it('plays, shows state, finishes and plays again', () => {
    const player = createAudioPlayer('Hello there', { lang: 'en-GB' });
    const [play] = player.element.querySelectorAll('button');
    expect(play.textContent).toBe('Play audio');
    play.click();
    expect(spoken[0].text).toBe('Hello there');
    expect(spoken[0].rate).toBe(1);
    expect(spoken[0].voice.lang).toBe('en-US');
    expect(play.textContent).toBe('Stop');
    expect(player.element.textContent).toContain('Playing');
    spoken[0].onend();
    expect(play.textContent).toBe('Play again');
    expect(player.element.textContent).toContain('Finished');
  });

  it('stops playback and ignores the cancelled utterance', () => {
    const player = createAudioPlayer('Hello');
    const [play] = player.element.querySelectorAll('button');
    play.click();
    play.click();
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(play.textContent).toBe('Play audio');
    spoken[0].onerror({ error: 'canceled' });
    expect(player.element.textContent).toContain('Ready to play');
  });

  it('plays at a slower rate when asked', () => {
    const player = createAudioPlayer('Hello');
    const [play, slow] = player.element.querySelectorAll('button');
    slow.click();
    expect(slow.getAttribute('aria-pressed')).toBe('true');
    play.click();
    expect(spoken[0].rate).toBe(0.75);
  });

  it('reports a real playback error', () => {
    const player = createAudioPlayer('Hello');
    player.element.querySelector('button').click();
    spoken[0].onerror({ error: 'synthesis-failed' });
    expect(player.element.textContent).toContain('could not play');
  });

  it('speaks a single word', () => {
    speak('market');
    expect(spoken[0].text).toBe('market');
  });
});
