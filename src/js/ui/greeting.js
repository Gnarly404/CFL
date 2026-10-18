/**
 * The dashboard greeting follows the hour on the reader's own clock: a different salutation and a different
 * line for morning, afternoon, evening and late night. The page keeps it current while it stays open.
 */
export const PERIODS = Object.freeze([
  { key: 'morning', from: 5, to: 12, greeting: 'Good morning' },
  { key: 'afternoon', from: 12, to: 17, greeting: 'Good afternoon' },
  { key: 'evening', from: 17, to: 21, greeting: 'Good evening' },
  { key: 'night', from: 21, to: 29, greeting: 'Hello' }, // 21:00 to 04:59, wrapping past midnight
]);

const LINES = {
  student: {
    morning: 'A fresh start. Here is what you can work on today.',
    afternoon: 'Pick up where you left off.',
    evening: 'A short, steady session now will keep you moving.',
    night: 'It is late. One short lesson, then rest.',
  },
  instructor: {
    morning: 'Here is your day: students, writing to review and classes.',
    afternoon: 'Check what is waiting for feedback this afternoon.',
    evening: 'Wrap up your reviews and plan tomorrow’s classes.',
    night: 'Working late? Anything you leave will be here in the morning.',
  },
};

export function periodFor(date = new Date()) {
  const hour = date.getHours();
  const shifted = hour < 5 ? hour + 24 : hour;
  return PERIODS.find((period) => shifted >= period.from && shifted < period.to) ?? PERIODS[3];
}

/** @returns {{ key: string, greeting: string, line: string }} */
export function greetingFor(date = new Date(), audience = 'student') {
  const period = periodFor(date);
  return { key: period.key, greeting: period.greeting, line: (LINES[audience] ?? LINES.student)[period.key] };
}

/**
 * Writes the greeting into the page and keeps it current: checked every minute and when the tab becomes visible
 * again, and the text only changes when the period does.
 * @param {{ greetingEl: Element|null, lineEl?: Element|null, audience?: string, now?: () => Date }} options
 */
export function mountGreeting({
  greetingEl, lineEl = null, audience = 'student', now = () => new Date(),
} = {}) {
  if (!greetingEl) return () => {};
  let shown = '';
  const update = () => {
    const next = greetingFor(now(), audience);
    if (next.key === shown) return;
    shown = next.key;
    greetingEl.textContent = next.greeting;
    if (lineEl) lineEl.textContent = next.line;
    document.documentElement.dataset.dayPeriod = next.key;
  };
  update();
  const timer = setInterval(update, 60_000);
  const onVisible = () => { if (!document.hidden) update(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
}
