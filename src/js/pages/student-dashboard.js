import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { guardPage } from '@/auth/guards.js';
import { dbService } from '@/services/firebase-db.js';
import { el } from '@/utils/dom.js';
import grammar from '../../data/practice/grammar.json';
import { ROUTES } from '@/core/routes.js';
import { lessonStatus, nextLesson, skillPercent } from '@/practice/engine.js';
import { SKILLS } from '@/practice/skills.js';
import { loadLessonProgress } from '@/services/practice-service.js';
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
  let progress = {};
  try {
    progress = await loadLessonProgress(session.user.uid, 'grammar');
  } catch (error) {
    console.warn('Could not load practice progress', error?.code ?? error);
  }
  const lessons = grammar.lessons;
  const next = nextLesson(lessons, progress);
  const percent = skillPercent(lessons, progress);
  const done = lessons.filter((lesson) => lessonStatus(progress, lesson.id) === 'completed').length;
  const titleEl = document.getElementById('continueTitle');
  const textEl = document.getElementById('continueText');
  const actionEl = document.getElementById('continueAction');
  const gridEl = document.getElementById('skillGrid');
  if (titleEl) titleEl.textContent = next ? next.title : 'Grammar complete';
  if (textEl) textEl.textContent = next ? `Grammar: ${done} of ${lessons.length} lessons completed. ${next.summary}` : 'You have finished every grammar lesson.';
  if (actionEl) {
    actionEl.replaceChildren(h('a', { class: 'btn btn-primary', href: next ? `${ROUTES.practiceLesson}?skill=grammar&id=${encodeURIComponent(next.id)}` : ROUTES.practice }, next ? (done ? 'Continue' : 'Start lesson') : 'Open English Practice'));
  }
  if (gridEl) {
    gridEl.replaceChildren(...SKILLS.map((skill) => (skill.available
      ? h('a', { class: 'skill', href: ROUTES.practice }, skill.label, h('small', {}, `${percent}% complete`))
      : h('div', { class: 'skill', 'aria-disabled': 'true' }, skill.label, h('small', {}, 'Coming soon')))));
  }
}
