// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecorder, recordingSupported } from '@/ui/recorder.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });
let stopTrack;
let instances;

class FakeRecorder {
  static isTypeSupported(type) { return type === 'audio/webm'; }
  constructor(stream, options) { this.options = options; this.state = 'inactive'; this.mimeType = options?.mimeType ?? ''; instances.push(this); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio']) }); this.onstop?.(); }
}

function install(getUserMedia) {
  window.MediaRecorder = FakeRecorder;
  Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  URL.createObjectURL = vi.fn(() => 'blob:recording');
  URL.revokeObjectURL = vi.fn();
}

beforeEach(() => {
  instances = [];
  stopTrack = vi.fn();
});
afterEach(() => {
  delete window.MediaRecorder;
  delete window.navigator.mediaDevices;
  vi.useRealTimers();
});

describe('recorder without support', () => {
  it('explains and offers no controls', () => {
    expect(recordingSupported()).toBe(false);
    const recorder = createRecorder();
    expect(recorder.supported).toBe(false);
    expect(recorder.element.textContent).toContain('Recording is not available');
    expect(recorder.element.querySelector('button')).toBeNull();
  });
});

describe('recorder with support', () => {
  const ok = () => vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });

  it('records, releases the microphone and offers playback', async () => {
    install(ok());
    const onChange = vi.fn();
    const recorder = createRecorder({ onChange });
    const [start] = recorder.element.querySelectorAll('button');
    start.click();
    await flush();
    expect(start.textContent).toBe('Stop recording');
    expect(instances[0].options).toEqual({ mimeType: 'audio/webm' });
    start.click();
    expect(stopTrack).toHaveBeenCalled();
    expect(recorder.hasRecording()).toBe(true);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(recorder.element.querySelector('audio').getAttribute('src')).toBe('blob:recording');
    expect(recorder.element.querySelector('audio').hidden).toBe(false);
  });

  it('lets the student record again and frees the old recording', async () => {
    install(ok());
    const onChange = vi.fn();
    const recorder = createRecorder({ onChange });
    const [start, again] = recorder.element.querySelectorAll('button');
    start.click(); await flush(); start.click();
    again.click();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording');
    expect(recorder.hasRecording()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(recorder.element.querySelector('audio').hidden).toBe(true);
  });

  it.each([
    ['NotAllowedError', 'blocked'],
    ['NotFoundError', 'No microphone was found'],
    ['NotReadableError', 'another app'],
    ['Whatever', 'could not start'],
  ])('shows a clear message for %s', async (name, text) => {
    install(vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name })));
    const recorder = createRecorder();
    recorder.element.querySelector('button').click();
    await flush();
    expect(recorder.element.textContent).toContain(text);
    expect(recorder.element.querySelector('button').disabled).toBe(false);
  });

  it('stops by itself at the time limit', async () => {
    vi.useFakeTimers();
    install(ok());
    const recorder = createRecorder({ maxSeconds: 3 });
    recorder.element.querySelector('button').click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(recorder.hasRecording()).toBe(true);
  });

  it('turns the microphone off when destroyed mid-recording', async () => {
    install(ok());
    const recorder = createRecorder();
    recorder.element.querySelector('button').click();
    await flush();
    recorder.destroy();
    expect(stopTrack).toHaveBeenCalled();
    expect(recorder.hasRecording()).toBe(false);
  });
});
