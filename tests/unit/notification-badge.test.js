// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadNotifications = vi.fn();
vi.mock('@/services/notification-service.js', () => ({ loadNotifications: (...a) => loadNotifications(...a) }));

beforeEach(() => {
  loadNotifications.mockReset();
  document.body.innerHTML = '<span data-notification-count hidden></span><span data-notification-count hidden></span>';
});

describe('notification badge', () => {
  it('shows the unread count everywhere and hides at zero', async () => {
    const { setBadge } = await import('@/ui/notification-badge.js');
    setBadge(3);
    const [a, b] = document.querySelectorAll('[data-notification-count]');
    expect(a.hidden).toBe(false);
    expect(a.textContent).toContain('3');
    expect(b.textContent).toContain('3 unread');
    setBadge(120);
    expect(a.textContent).toContain('99+');
    setBadge(0);
    expect(a.hidden).toBe(true);
  });

  it('loads the count, and stays hidden when loading fails', async () => {
    const { mountNotificationBadge } = await import('@/ui/notification-badge.js');
    loadNotifications.mockResolvedValue([{ read: false, archived: false }, { read: true, archived: false }]);
    await mountNotificationBadge('u');
    expect(document.querySelector('[data-notification-count]').textContent).toContain('1');
    document.querySelectorAll('[data-notification-count]').forEach((n) => { n.hidden = true; });
    loadNotifications.mockRejectedValue(new Error('x'));
    await mountNotificationBadge('u');
    expect(document.querySelector('[data-notification-count]').hidden).toBe(true);
  });
});
