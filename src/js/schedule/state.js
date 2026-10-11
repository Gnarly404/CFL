/** Pure helpers for class schedules. A class is { id, programmeId, title, startsAtMs, endsAtMs, mode, location, instructorName, joinLink, notes, cancelled }. */

export const MODES = Object.freeze({ in_person: 'In person', online: 'Online' });
export const modeLabel = (mode) => MODES[mode] ?? 'In person';
export const EARLIER_DAYS = 14;

const ms = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : Number(value) || 0);

/** Only plain https links are ever shown as a link. Anything else (javascript:, http:, malformed) is dropped. */
export function safeJoinLink(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function normaliseClass(id, data = {}) {
  return {
    id,
    programmeId: String(data.programmeId ?? ''),
    title: String(data.title ?? 'Class'),
    startsAtMs: ms(data.startsAt),
    endsAtMs: ms(data.endsAt),
    mode: data.mode === 'online' ? 'online' : 'in_person',
    location: String(data.location ?? ''),
    instructorName: String(data.instructorName ?? ''),
    joinLink: safeJoinLink(data.joinLink),
    notes: String(data.notes ?? ''),
    cancelled: data.status === 'cancelled',
  };
}

/** upcoming: not yet finished, soonest first. earlier: finished, most recent first. */
export function splitClasses(list, now = Date.now()) {
  const upcoming = list.filter((c) => c.endsAtMs >= now).sort((a, b) => a.startsAtMs - b.startsAtMs);
  const earlier = list.filter((c) => c.endsAtMs < now).sort((a, b) => b.startsAtMs - a.startsAtMs);
  return { upcoming, earlier };
}

export const isHappeningNow = (c, now = Date.now()) => !c.cancelled && c.startsAtMs <= now && now < c.endsAtMs;

/** The first class that has not been cancelled and has not finished. */
export const nextClass = (upcoming) => upcoming.find((c) => !c.cancelled) ?? null;

export const formatDay = (value, timeZone) => new Date(value).toLocaleDateString('en-KE', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone,
});
export const formatTime = (value, timeZone) => new Date(value).toLocaleTimeString('en-KE', {
  hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
});
export const timeZoneName = (value, timeZone) => new Intl.DateTimeFormat('en-KE', { timeZoneName: 'short', timeZone })
  .formatToParts(new Date(value)).find((p) => p.type === 'timeZoneName')?.value ?? '';

/** Groups classes (already in order) by calendar day: [{ day, classes }]. */
export function groupByDay(list, timeZone) {
  const groups = [];
  list.forEach((c) => {
    const day = formatDay(c.startsAtMs, timeZone);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.classes.push(c);
    else groups.push({ day, classes: [c] });
  });
  return groups;
}

export function describeWhen(c, timeZone) {
  return `${formatTime(c.startsAtMs, timeZone)} to ${formatTime(c.endsAtMs, timeZone)} ${timeZoneName(c.startsAtMs, timeZone)}`.trim();
}
