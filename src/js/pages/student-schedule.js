import { guardPage } from '@/auth/guards.js';
import programmes from '../../data/programmes.json';
import {
  describeWhen, groupByDay, isHappeningNow, modeLabel, nextClass, splitClasses, formatDay,
} from '@/schedule/state.js';
import { loadMyClasses } from '@/services/schedule-service.js';
import { h } from '@/ui/h.js';
import { mountNotificationBadge } from '@/ui/notification-badge.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('schedule');
const session = await guardPage({ roles: ['student'] });
mountNotificationBadge(session.user.uid);
const $ = (id) => document.getElementById(id);
const programmeName = (id) => programmes.find((p) => p.id === id)?.name ?? 'Your programme';

function card(c, now) {
  const live = isHappeningNow(c, now);
  const where = c.mode === 'online' ? 'Online' : (c.location || modeLabel(c.mode));
  return h('li', { class: `class-row${c.cancelled ? ' is-cancelled' : ''}` },
    h('div', { class: 'notif-meta' },
      h('span', { class: 'badge' }, modeLabel(c.mode)),
      c.cancelled ? h('strong', {}, 'Cancelled') : '',
      live ? h('strong', {}, 'Happening now') : ''),
    h('h3', {}, c.title),
    h('p', {}, describeWhen(c)),
    h('p', { class: 'muted' }, [programmeName(c.programmeId), where, c.instructorName && `With ${c.instructorName}`].filter(Boolean).join(' · ')),
    c.notes ? h('p', {}, c.notes) : '',
    c.joinLink && !c.cancelled
      ? h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: c.joinLink, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Join online: ${c.title}` }, 'Join online'))
      : '');
}

function days(list, now) {
  return groupByDay(list).map(({ day, classes }) => h('section', { class: 'card' },
    h('h2', {}, day), h('ul', { class: 'notif-list' }, ...classes.map((c) => card(c, now)))));
}

let result = null;
try {
  result = await loadMyClasses(session.user.uid);
} catch (error) {
  console.warn('Could not load the schedule', error?.code ?? error);
  $('scheduleSummary').textContent = 'Your schedule could not be loaded.';
  const note = $('scheduleNote');
  note.hidden = false;
  note.textContent = 'Check your connection and refresh the page.';
}

if (result) {
  const now = Date.now();
  const { upcoming, earlier } = splitClasses(result.classes.filter((scheduleClass) => !scheduleClass.cancelled), now);
  const next = nextClass(upcoming);
  const summary = $('scheduleSummary');
  if (!result.programmeIds.length) summary.textContent = 'You are not enrolled in a programme yet, so there are no classes to show.';
  else if (!upcoming.length) summary.textContent = 'No upcoming classes yet. They will appear here when the Centre adds them.';
  else summary.textContent = `${upcoming.filter((c) => !c.cancelled).length} upcoming ${upcoming.filter((c) => !c.cancelled).length === 1 ? 'class' : 'classes'}.`;

  if (next) {
    const box = $('nextClass');
    box.hidden = false;
    box.replaceChildren(
      h('p', { class: 'eyebrow' }, isHappeningNow(next, now) ? 'On now' : 'Next class'),
      h('h2', { id: 'nextTitle' }, next.title),
      h('p', {}, `${formatDay(next.startsAtMs)}, ${describeWhen(next)}`),
      h('p', { class: 'muted' }, [programmeName(next.programmeId), next.mode === 'online' ? 'Online' : next.location, next.instructorName && `With ${next.instructorName}`].filter(Boolean).join(' · ')),
      next.joinLink ? h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: next.joinLink, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Join online: ${next.title}` }, 'Join online')) : '');
  }
  $('scheduleDays').replaceChildren(...days(upcoming, now));
  if (earlier.length) {
    $('earlierBox').hidden = false;
    $('earlierSummary').textContent = `Earlier classes (${earlier.length})`;
    $('earlierDays').replaceChildren(...days(earlier, now));
  }
}
