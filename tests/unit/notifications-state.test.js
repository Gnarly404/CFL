import { describe, expect, it } from 'vitest';
import { applyFilter, categoryLabel, safeLink, timeAgo, unreadCount, visible } from '../../src/js/notifications/state.js';

const n = (id, extra = {}) => ({ id, title: id, read: false, archived: false, ...extra });

describe('notification state', () => {
  it('hides archived items and counts only unread visible ones', () => {
    const list = [n('a'), n('b', { read: true }), n('c', { archived: true })];
    expect(visible(list).map((x) => x.id)).toEqual(['a', 'b']);
    expect(unreadCount(list)).toBe(1);
    expect(applyFilter(list, 'unread').map((x) => x.id)).toEqual(['a']);
    expect(applyFilter(list, 'all')).toHaveLength(2);
  });

  it('labels categories and falls back for unknown ones', () => {
    expect(categoryLabel('teacher')).toBe('Teacher');
    expect(categoryLabel('weird')).toBe('Update');
  });

  it('follows only links inside the student area', () => {
    expect(safeLink('/student/practice')).toBe('/student/practice');
    expect(safeLink('/student/practice/lesson?skill=writing&id=x')).toBe('/student/practice/lesson?skill=writing&id=x');
    expect(safeLink('https://evil.example')).toBeNull();
    expect(safeLink('//evil.example')).toBeNull();
    expect(safeLink('/admin/dashboard')).toBeNull();
    expect(safeLink('/instructor/review')).toBeNull();
    expect(safeLink(null)).toBeNull();
    expect(safeLink('javascript:alert(1)')).toBeNull();
  });

  it('describes time in plain words', () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(0, now)).toBe('');
    expect(timeAgo(now - 10_000, now)).toBe('Just now');
    expect(timeAgo(now - 60_000, now)).toBe('1 minute ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(timeAgo(now - 26 * 3_600_000, now)).toBe('Yesterday');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3 days ago');
  });
});
