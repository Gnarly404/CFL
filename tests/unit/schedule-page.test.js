// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage, tick } from '../helpers.js';

const loadMyClasses = vi.fn();
let failLoad = false;
vi.mock('@/auth/guards.js', () => ({ guardPage: vi.fn().mockResolvedValue({ user: { uid: 'stu1' } }) }));
vi.mock('@/ui/notification-badge.js', () => ({ mountNotificationBadge: vi.fn() }));
vi.mock('@/services/schedule-service.js', () => ({ loadMyClasses: async (...a) => { if (failLoad) throw new Error('offline'); return loadMyClasses(...a); } }));

const H = 3_600_000;
const cls = (id, startOffsetH, extra = {}) => ({
  id, programmeId: 'english-intake', title: `Class ${id}`, startsAtMs: Date.now() + startOffsetH * H, endsAtMs: Date.now() + (startOffsetH + 1) * H,
  mode: 'in_person', location: 'Room 2', instructorName: 'Ms Otieno', joinLink: null, notes: '', cancelled: false, ...extra,
});
const text = (id) => document.getElementById(id).textContent;

async function open() {
  vi.resetModules();
  loadPage('student/schedule.html');
  await import('@/pages/student-schedule.js');
  await tick();
}

beforeEach(() => { loadMyClasses.mockReset(); failLoad = false; });

describe('student schedule page', () => {
  it('shows the next class, the upcoming list and earlier classes', async () => {
    loadMyClasses.mockResolvedValue({ programmeIds: ['english-intake'], classes: [cls('b', 48), cls('a', 24), cls('old', -48)] });
    await open();
    expect(loadMyClasses).toHaveBeenCalledWith('stu1');
    expect(text('scheduleSummary')).toBe('2 upcoming classes.');
    expect(document.getElementById('nextClass').hidden).toBe(false);
    expect(text('nextClass')).toContain('Class a');
    expect(text('scheduleDays')).toContain('Class b');
    expect(document.getElementById('earlierBox').hidden).toBe(false);
    expect(text('earlierSummary')).toBe('Earlier classes (1)');
    expect(text('earlierDays')).toContain('Class old');
  });

  it('offers a join link only for a safe, uncancelled online class', async () => {
    loadMyClasses.mockResolvedValue({ programmeIds: ['p'], classes: [
      cls('a', 24, { mode: 'online', joinLink: 'https://meet.example.com/x' }),
      cls('b', 48, { mode: 'online', joinLink: 'https://meet.example.com/y', cancelled: true }),
    ] });
    await open();
    const links = [...document.querySelectorAll('a[href^="https://meet"]')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://meet.example.com/x', 'https://meet.example.com/x']);
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(text('scheduleDays')).toContain('Cancelled');
  });

  it('does not make a cancelled class the next class', async () => {
    loadMyClasses.mockResolvedValue({ programmeIds: ['p'], classes: [cls('x', 5, { cancelled: true }), cls('y', 30)] });
    await open();
    expect(text('nextClass')).toContain('Class y');
    expect(text('scheduleSummary')).toBe('1 upcoming class.');
  });

  it('explains an empty schedule and a missing enrolment', async () => {
    loadMyClasses.mockResolvedValue({ programmeIds: [], classes: [] });
    await open();
    expect(text('scheduleSummary')).toContain('not enrolled');
    loadMyClasses.mockResolvedValue({ programmeIds: ['p'], classes: [] });
    await open();
    expect(text('scheduleSummary')).toContain('No upcoming classes yet');
    expect(document.getElementById('nextClass').hidden).toBe(true);
  });

  it('shows a clear message when loading fails', async () => {
    failLoad = true;
    await open();
    expect(text('scheduleSummary')).toContain('could not be loaded');
    expect(document.getElementById('scheduleNote').hidden).toBe(false);
  });
});
