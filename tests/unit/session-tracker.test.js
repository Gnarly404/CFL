import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startTracker } from '@/practice/session-tracker.js';

const recordSession = vi.fn();
vi.mock('@/services/practice-service.js', () => ({ recordSession: (...args) => recordSession(...args) }));

describe('startTracker', () => {
  beforeEach(() => { recordSession.mockReset().mockResolvedValue(); vi.useRealTimers(); });

  it('records one session with the elapsed seconds and local date, once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 9, 0, 0));
    const tracker = startTracker({ uid: 'u1', skill: 'grammar', lessonId: 'g1' });
    vi.setSystemTime(new Date(2026, 9, 10, 9, 2, 30));
    expect(await tracker.complete()).toBe(true);
    await tracker.complete();
    expect(recordSession).toHaveBeenCalledTimes(1);
    expect(recordSession).toHaveBeenCalledWith('u1', { skill: 'grammar', lessonId: 'g1', kind: 'lesson', seconds: 150, date: '2026-10-10' });
  });

  it('caps an idle tab at 20 minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 9, 0, 0));
    const tracker = startTracker({ uid: 'u1', skill: 'grammar', lessonId: 'g1' });
    vi.setSystemTime(new Date(2026, 9, 10, 14, 0, 0));
    await tracker.complete();
    expect(recordSession.mock.calls[0][1].seconds).toBe(1200);
  });

  it('can retry after a failed write and restarts for a new attempt', async () => {
    recordSession.mockRejectedValueOnce(new Error('offline'));
    const tracker = startTracker({ uid: 'u1', skill: 'review', lessonId: 'review', kind: 'review' });
    expect(await tracker.complete()).toBe(false);
    expect(await tracker.complete()).toBe(true);
    tracker.reset();
    await tracker.complete();
    expect(recordSession).toHaveBeenCalledTimes(3);
  });
});
