// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage, tick } from '../helpers.js';

const loadNotifications = vi.fn();
const markRead = vi.fn();
const archive = vi.fn();
const markAllRead = vi.fn();
const navigate = vi.fn();
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'stu1' } }) }));
vi.mock('@/services/notification-service.js', () => ({
  loadNotifications: (...a) => loadNotifications(...a),
  markRead: (...a) => markRead(...a),
  archive: (...a) => archive(...a),
  markAllRead: (...a) => markAllRead(...a),
}));
vi.mock('@/ui/navigate.js', () => ({ navigate: (...a) => navigate(...a) }));

const item = (id, extra = {}) => ({ id, title: `T-${id}`, body: `B-${id}`, category: 'teacher', link: '/student/practice', createdAtMs: Date.now(), read: false, archived: false, ...extra });
const text = (id) => document.getElementById(id).textContent;
const click = (selector) => document.querySelector(selector).click();

async function open() {
  vi.resetModules();
  loadPage('student/notifications.html');
  await import('@/pages/student-notifications.js');
  await tick();
}

beforeEach(() => {
  loadNotifications.mockReset().mockResolvedValue([item('a'), item('b', { read: true }), item('c', { archived: true })]);
  markRead.mockReset().mockResolvedValue();
  archive.mockReset().mockResolvedValue();
  markAllRead.mockReset().mockResolvedValue();
  navigate.mockReset();
});

describe('student notifications page', () => {
  it('lists visible notifications with an unread summary and hides archived ones', async () => {
    await open();
    expect(loadNotifications).toHaveBeenCalledWith('stu1');
    expect(text('notifSummary')).toBe('1 unread · 2 in total');
    expect(text('notifList')).toContain('T-a');
    expect(text('notifList')).not.toContain('T-c');
  });

  it('filters to unread', async () => {
    await open();
    click('[data-filter="unread"]');
    expect(text('notifList')).toContain('T-a');
    expect(text('notifList')).not.toContain('T-b');
    expect(document.querySelector('[data-filter="unread"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('marks one as read and updates the summary', async () => {
    await open();
    click('button[aria-label="Mark as read: T-a"]'); await tick();
    expect(markRead).toHaveBeenCalledWith('a');
    expect(text('notifSummary')).toBe('0 unread · 2 in total');
  });

  it('archives an item', async () => {
    await open();
    click('button[aria-label="Archive: T-b"]'); await tick();
    expect(archive).toHaveBeenCalledWith('b');
    expect(text('notifList')).not.toContain('T-b');
  });

  it('marks all as read', async () => {
    await open();
    click('#markAll'); await tick();
    expect(markAllRead).toHaveBeenCalledWith(['a']);
    expect(document.getElementById('markAll').hidden).toBe(true);
  });

  it('opens the link after marking it read', async () => {
    await open();
    click('a[aria-label="Open: T-a"]'); await tick();
    expect(markRead).toHaveBeenCalledWith('a');
    expect(navigate).toHaveBeenCalledWith('/student/practice');
  });

  it('still opens the link if marking read fails', async () => {
    markRead.mockRejectedValue(new Error('x'));
    await open();
    click('a[aria-label="Open: T-a"]'); await tick();
    expect(navigate).toHaveBeenCalledWith('/student/practice');
  });

  it('shows no link for an unsafe destination', async () => {
    loadNotifications.mockResolvedValue([item('x', { link: 'https://evil.example' })]);
    await open();
    expect(document.querySelector('a[aria-label^="Open"]')).toBeNull();
  });

  it('shows an error note and keeps the item when an action fails', async () => {
    archive.mockRejectedValue(new Error('x'));
    await open();
    click('button[aria-label="Archive: T-b"]'); await tick();
    expect(document.getElementById('notifNote').hidden).toBe(false);
    expect(text('notifList')).toContain('T-b');
  });

  it('shows an empty state and a load failure', async () => {
    loadNotifications.mockResolvedValue([]);
    await open();
    expect(text('notifSummary')).toBe('You have no notifications.');
    loadNotifications.mockRejectedValue(new Error('x'));
    await open();
    expect(text('notifSummary')).toContain('could not be loaded');
  });
});
