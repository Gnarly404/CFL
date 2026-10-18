// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { greetingFor, mountGreeting, periodFor } from '@/ui/greeting.js';

const at = (h, m = 0) => new Date(2026, 9, 18, h, m);

describe('time-of-day greeting', () => {
  it('changes at the period boundaries', () => {
    const cases = [[4, 59, 'night'], [5, 0, 'morning'], [11, 59, 'morning'], [12, 0, 'afternoon'], [16, 59, 'afternoon'], [17, 0, 'evening'], [20, 59, 'evening'], [21, 0, 'night'], [0, 30, 'night']];
    cases.forEach(([h, m, key]) => expect(periodFor(at(h, m)).key).toBe(key));
  });

  it('gives each period its own greeting and a line for the audience', () => {
    expect(greetingFor(at(8)).greeting).toBe('Good morning');
    expect(greetingFor(at(14)).greeting).toBe('Good afternoon');
    expect(greetingFor(at(19)).greeting).toBe('Good evening');
    expect(greetingFor(at(23)).greeting).toBe('Hello');
    const lines = new Set([8, 14, 19, 23].map((h) => greetingFor(at(h), 'student').line));
    expect(lines.size).toBe(4);
    expect(greetingFor(at(8), 'instructor').line).not.toBe(greetingFor(at(8), 'student').line);
  });

  it('updates the page when the period changes while it is open', () => {
    document.body.innerHTML = '<span id="g"></span><p id="l"></p>';
    let hour = 8;
    const stop = mountGreeting({ greetingEl: document.getElementById('g'), lineEl: document.getElementById('l'), now: () => at(hour) });
    expect(document.getElementById('g').textContent).toBe('Good morning');
    hour = 13;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.getElementById('g').textContent).toBe('Good afternoon');
    stop();
  });
});
