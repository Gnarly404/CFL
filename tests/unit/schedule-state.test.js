import { describe, expect, it } from 'vitest';
import {
  describeWhen, groupByDay, isHappeningNow, nextClass, normaliseClass, safeJoinLink, splitClasses,
} from '../../src/js/schedule/state.js';
import { buildClass } from '../../src/js/schedule/validate.js';

const TZ = 'Africa/Nairobi';
const c = (id, start, end, extra = {}) => ({ id, startsAtMs: start, endsAtMs: end, cancelled: false, ...extra });
const H = 3_600_000;

describe('safeJoinLink', () => {
  it('keeps https links and drops everything else', () => {
    expect(safeJoinLink('https://meet.example.com/abc')).toBe('https://meet.example.com/abc');
    expect(safeJoinLink('http://meet.example.com')).toBeNull();
    expect(safeJoinLink('javascript:alert(1)')).toBeNull();
    expect(safeJoinLink('not a url')).toBeNull();
    expect(safeJoinLink('')).toBeNull();
    expect(safeJoinLink(null)).toBeNull();
    expect(safeJoinLink(`https://x.com/${'a'.repeat(600)}`)).toBeNull();
  });
});

describe('normaliseClass', () => {
  it('reads timestamps, defaults, and cancelled status', () => {
    const n = normaliseClass('a', {
      programmeId: 'p', title: 'Speaking', startsAt: { toMillis: () => 1000 }, endsAt: { toMillis: () => 2000 }, mode: 'online', joinLink: 'javascript:x', status: 'cancelled',
    });
    expect(n).toMatchObject({ id: 'a', startsAtMs: 1000, endsAtMs: 2000, mode: 'online', joinLink: null, cancelled: true });
    expect(normaliseClass('b', {}).mode).toBe('in_person');
  });
});

describe('splitting and ordering', () => {
  const now = 100 * H;
  const list = [c('late', 110 * H, 111 * H), c('soon', 102 * H, 103 * H), c('old', 10 * H, 11 * H), c('older', 5 * H, 6 * H), c('now', 99 * H, 101 * H)];
  it('puts unfinished classes first, soonest first, and finished ones most recent first', () => {
    const { upcoming, earlier } = splitClasses(list, now);
    expect(upcoming.map((x) => x.id)).toEqual(['now', 'soon', 'late']);
    expect(earlier.map((x) => x.id)).toEqual(['old', 'older']);
  });
  it('finds the next class that is not cancelled and detects one in progress', () => {
    const { upcoming } = splitClasses([c('x', 99 * H, 101 * H, { cancelled: true }), c('y', 102 * H, 103 * H)], now);
    expect(nextClass(upcoming).id).toBe('y');
    expect(nextClass([])).toBeNull();
    expect(isHappeningNow(c('z', 99 * H, 101 * H), now)).toBe(true);
    expect(isHappeningNow(c('z', 99 * H, 101 * H, { cancelled: true }), now)).toBe(false);
    expect(isHappeningNow(c('z', 101 * H, 102 * H), now)).toBe(false);
  });
});

describe('days and times', () => {
  it('groups by calendar day in the given time zone', () => {
    const base = Date.UTC(2026, 9, 12, 7, 0); // 10:00 in Nairobi
    const groups = groupByDay([c('a', base, base + H), c('b', base + 2 * H, base + 3 * H), c('c', base + 24 * H, base + 25 * H)], TZ);
    expect(groups.map((g) => g.classes.length)).toEqual([2, 1]);
    expect(groups[0].day).toContain('Monday');
  });
  it('describes the time range with a zone', () => {
    const start = Date.UTC(2026, 9, 12, 7, 0);
    const text = describeWhen(c('a', start, start + H), TZ);
    expect(text).toMatch(/10:00\s?am to 11:00\s?am/i);
    expect(text).toMatch(/(EAT|GMT\+3)/);
  });
});

describe('buildClass', () => {
  const good = { programmeId: 'english-intake', title: ' Speaking ', date: '2026-10-12', start: '10:00', end: '11:30', mode: 'online', location: '', joinLink: 'https://meet.example.com/x', notes: '', instructorId: 'ins1' };
  const instructors = [{ uid: 'ins1', displayName: 'Ms Otieno' }];
  it('builds a valid class and trims', () => {
    const { errors, value } = buildClass(good, instructors);
    expect(errors).toEqual([]);
    expect(value.title).toBe('Speaking');
    expect(value.instructorName).toBe('Ms Otieno');
    expect(value.endsAt.getTime() - value.startsAt.getTime()).toBe(90 * 60000);
  });
  it('reports each problem in plain words', () => {
    expect(buildClass({ ...good, programmeId: '' }).errors).toContain('Choose a programme.');
    expect(buildClass({ ...good, title: '' }).errors).toContain('Give the class a title.');
    expect(buildClass({ ...good, title: 'x'.repeat(121) }).errors[0]).toContain('title');
    expect(buildClass({ ...good, end: '09:00' }).errors).toContain('The end time must be after the start time.');
    expect(buildClass({ ...good, date: '' }).errors[0]).toContain('Choose a date');
    expect(buildClass({ ...good, mode: 'moon' }).errors).toContain('Choose in person or online.');
    expect(buildClass({ ...good, joinLink: 'http://x.com' }).errors).toContain('The join link must start with https://.');
  });
  it('ignores an unknown instructor id', () => {
    expect(buildClass({ ...good, instructorId: 'nobody' }, instructors).value.instructorId).toBe('');
  });
});
