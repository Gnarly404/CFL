// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const watchUnreadNotifications = vi.fn();
vi.mock('@/services/notification-service.js', () => ({ watchUnreadNotifications: (...a) => watchUnreadNotifications(...a) }));

beforeEach(() => {
  watchUnreadNotifications.mockReset();
  document.body.innerHTML = '<span data-notification-count data-attention-key="notifications" hidden></span><span data-notification-count data-attention-key="notifications" hidden></span>';
});

describe('notification badge', () => {
  it('shows the unread count everywhere and hides at zero', async () => {
    const { setBadge } = await import('@/ui/notification-badge.js');
    setBadge(3);
    const [a, b] = document.querySelectorAll('[data-notification-count]');
    expect(a.hidden).toBe(false);
    expect(a.textContent).toContain('3');
    expect(b.getAttribute('aria-label')).toBe('3 unread notifications');
    setBadge(120);
    expect(a.textContent).toContain('99+');
    setBadge(0);
    expect(a.hidden).toBe(true);
  });

  it('renders a separate attention count with accessible text', async () => {
    document.body.innerHTML = '<a><span data-attention-key="applications" hidden><span></span><span></span></span></a>';
    const { setAttentionBadge } = await import('@/ui/attention-badge.js');
    setAttentionBadge('applications', 4);
    const badge = document.querySelector('[data-attention-key="applications"]');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain('4');
    expect(badge.getAttribute('aria-label')).toBe('4 applications need attention');
    setAttentionBadge('applications', 0);
    expect(badge.hidden).toBe(true);
  });

  it('loads the count, and stays hidden when loading fails', async () => {
    const { mountNotificationBadge } = await import('@/ui/notification-badge.js');
    let updateCount;
    let reportError;
    watchUnreadNotifications.mockImplementation((uid, onCount, onError) => {
      expect(uid).toBe('u');
      updateCount = onCount;
      reportError = onError;
      return () => {};
    });
    mountNotificationBadge('u');
    updateCount(1);
    expect(document.querySelector('[data-notification-count]').textContent).toContain('1');
    document.querySelectorAll('[data-notification-count]').forEach((n) => { n.hidden = true; });
    reportError(new Error('x'));
    expect(document.querySelector('[data-notification-count]').hidden).toBe(true);
  });
});
