// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_IDLE_MS, startSessionLifecycle } from '@/auth/session-lifecycle.js';

describe('session inactivity lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('warns at one minute remaining and expires after 45 minutes without activity', () => {
    vi.useFakeTimers();
    const onWarning = vi.fn();
    const onExpire = vi.fn();
    const stop = startSessionLifecycle({ uid: 'user-1', onWarning, onExpire });

    vi.advanceTimersByTime(SESSION_IDLE_MS - 60_000);
    expect(onWarning).toHaveBeenCalledOnce();
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(onExpire).toHaveBeenCalledOnce();
    stop();
  });

  it('resets the expiry clock after user activity', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const stop = startSessionLifecycle({ uid: 'user-2', onWarning: vi.fn(), onExpire });

    vi.advanceTimersByTime(SESSION_IDLE_MS - 1_000);
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(SESSION_IDLE_MS - 1_000);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onExpire).toHaveBeenCalledOnce();
    stop();
  });
});
