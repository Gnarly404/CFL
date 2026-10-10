import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { guardPage } from '@/auth/guards.js';
import { dbService } from '@/services/firebase-db.js';
import { el } from '@/utils/dom.js';
import { ROUTES } from '@/core/routes.js';
import { lessonUrl } from '@/practice/content.js';
import { pickContinue } from '@/practice/engine.js';
import { loadOverview } from '@/practice/overview.js';
import { mountToday } from '@/practice/today.js';
import { SKILLS } from '@/practice/skills.js';
import { h } from '@/ui/h.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('dashboard');
const session = await guardPage({ roles: ['student'] });
const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
const dayMessage = document.getElementById('dayMessage');
if (dayMessage) dayMessage.textContent = `${greeting}. Here is what you can work on today.`;

const nameEl = document.getElementById('studentName');
const regEl = document.getElementById('registrationNumber');
const chipEl = document.getElementById('profileName');
const profileStatusEl = document.getElementById('profileStatus');
const applicationStatusEl = document.getElementById('applicationStatus');
const studentDetailsEl = document.getElementById('studentDetails');
const enrolmentsEl = document.getElementById('enrolments');

const shownName = session.user.displayName || session.user.email;
if (nameEl) nameEl.textContent = shownName;
if (chipEl) chipEl.textContent = shownName;

try {
  const [studentSnap, applicationSnap, enrolmentSnap] = await Promise.all([
    getDoc(doc(dbService(), 'students', session.user.uid)),
    getDocs(query(
      collection(dbService(), 'applications'),
      where('email', '==', session.user.email),
      orderBy('createdAt', 'desc'),
      limit(1),
    )),
    getDocs(query(collection(dbService(), 'enrolments'), where('studentId', '==', session.user.uid))),
  ]);

  const profile = studentSnap.exists() ? studentSnap.data() : {};
  const profileName = profile.displayName || shownName;
  if (nameEl) nameEl.textContent = profileName;
  if (chipEl) chipEl.textContent = profileName;
  if (regEl) regEl.textContent = profile.profile?.applicationReference ?? '—';
  if (profileStatusEl) profileStatusEl.textContent = profile.status ?? 'Account active';

  const application = applicationSnap.docs[0]?.data() ?? null;
  if (applicationStatusEl) {
    applicationStatusEl.textContent = application ? application.status : 'No application found';
    applicationStatusEl.title = application ? `Reference: ${application.reference}` : 'No application record';
  }

  if (studentDetailsEl) {
    studentDetailsEl.replaceChildren(
      application ? el('p', {}, `Application reference: ${application.reference}`) : el('p', {}, 'No application found.'),
      el('p', {}, `Account email: ${session.user.email ?? '—'}`),
    );
  }

  if (enrolmentsEl) {
    const enrolments = enrolmentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    enrolmentsEl.replaceChildren(...(enrolments.length
      ? enrolments.map((enrolment) => el('li', {}, `${enrolment.programmeId ?? 'Programme'} · ${enrolment.status ?? 'Pending'}`))
      : [el('li', {}, 'No enrolments recorded yet.')])
    );
  }
} catch (error) {
  if (regEl) regEl.textContent = '—';
  if (applicationStatusEl) applicationStatusEl.textContent = 'Unavailable';
  console.warn('Could not load the student profile', error?.code ?? error);
}

// Continue Learning and the practice skill cards come from real lesson progress.
{
  const { entries } = await loadOverview(session.user.uid);
  const pick = pickContinue(entries);
  const todayEl = document.getElementById('todayCard');
  if (todayEl) await mountToday(todayEl, { uid: session.user.uid, entries });
  const titleEl = document.getElementById('continueTitle');
  const textEl = document.getElementById('continueText');
  const actionEl = document.getElementById('continueAction');
  const gridEl = document.getElementById('skillGrid');
  if (titleEl) titleEl.textContent = pick ? pick.next.title : 'All available lessons complete';
  if (textEl) textEl.textContent = pick ? `${pick.skill.label}: ${pick.done} of ${pick.lessons.length} lessons completed. ${pick.next.summary}` : 'You can review any lesson in English Practice.';
  if (actionEl) {
    actionEl.replaceChildren(h('a', { class: 'btn btn-primary', href: pick ? lessonUrl(pick.skill.id, pick.next.id) : ROUTES.practice }, pick ? (pick.done ? 'Continue' : 'Start lesson') : 'Open English Practice'));
  }
  if (gridEl) {
    gridEl.replaceChildren(...SKILLS.map((skill) => {
      const entry = entries.find((e) => e.skill.id === skill.id);
      return entry
        ? h('a', { class: 'skill', href: ROUTES.practice }, skill.label, h('small', {}, `${entry.percent}% complete`))
        : h('div', { class: 'skill', 'aria-disabled': 'true' }, skill.label, h('small', {}, 'Coming soon'));
    }));
  }
}
